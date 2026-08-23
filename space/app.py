"""Gradio demo for Lightricks/LTX-2.5.

Runs the open-weights LTX-2.5 checkpoints through `DistilledPipeline` (the fast
8-sigma two-stage pipeline from https://github.com/Lightricks/LTX-2) to produce a
video with a synchronized audio track from a prompt, optionally conditioned on a
first frame.

Everything that touches hardware is configurable through environment variables so
the same file runs on a dedicated GPU Space, on ZeroGPU, or on a local box -- see
the README for the full list.
"""

from __future__ import annotations

import logging
import os
import random
import tempfile
import threading
from pathlib import Path

import gradio as gr
import torch
from huggingface_hub import hf_hub_download
from huggingface_hub.errors import EntryNotFoundError, GatedRepoError, RepositoryNotFoundError

from ltx_core.model.video_vae import AUTO_TILING, get_video_chunks_number
from ltx_core.quantization import QuantizationPolicy
from ltx_pipelines.distilled import DistilledPipeline
from ltx_pipelines.utils.args import ImageConditioningInput
from ltx_pipelines.utils.media_io import encode_video
from ltx_pipelines.utils.model_paths import ModelPaths
from ltx_pipelines.utils.quantization_factory import QuantizationKind
from ltx_pipelines.utils.types import AutoDuration, OffloadMode

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ltx-2.5-demo")

# --------------------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------------------

MODEL_REPO = os.environ.get("LTX_MODEL_REPO", "Lightricks/LTX-2.5")
HF_TOKEN = os.environ.get("HF_TOKEN")

# One file per component -- LTX-2.5 publishes a split pack, so we fetch only what
# DistilledPipeline needs. The convolutional video VAE is the default because it is
# lighter and, unlike the diffusion decoder, needs no `natten` build.
COMPONENT_FILES = {
    "transformer": os.environ.get(
        "LTX_TRANSFORMER", "diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors"
    ),
    "text_encoder": os.environ.get(
        "LTX_TEXT_ENCODER", "text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors"
    ),
    "video_vae": os.environ.get("LTX_VIDEO_VAE", "vae/ltx-2.5-video-vae-conv-bf16.safetensors"),
    "audio_vae": os.environ.get("LTX_AUDIO_VAE", "vae/ltx-2.5-audio-vae-bf16.safetensors"),
    "spatial_upsampler": os.environ.get(
        "LTX_SPATIAL_UPSAMPLER",
        "latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors",
    ),
    "duration_head": os.environ.get(
        "LTX_DURATION_HEAD", "model_patches/ltx-2.5-duration-head-bf16.safetensors"
    ),
}

# "fp8-cast" downcasts the bf16 transformer on the fly and roughly halves its footprint,
# which is what makes 22B fit next to the Gemma 4 text encoder on a single 80GB card.
# Set LTX_QUANTIZATION="" for full bf16 on a card with headroom (H200 and up).
QUANTIZATION = os.environ.get("LTX_QUANTIZATION", "fp8-cast").strip()
# "none" | "cpu" | "disk" -- stream transformer weights to trade speed for memory.
OFFLOAD = os.environ.get("LTX_OFFLOAD", "none").strip()

IS_ZERO_GPU = bool(os.environ.get("SPACES_ZERO_GPU"))
# Must cover the one-time weight load as well as generation itself.
GPU_DURATION = int(os.environ.get("LTX_GPU_DURATION", "600"))

MAX_SECONDS = float(os.environ.get("LTX_MAX_SECONDS", "10"))
# The causal VAE's temporal grid: a valid frame count is always 8k + 1.
TEMPORAL_GRID = 8

try:  # ZeroGPU only; a no-op everywhere else.
    import spaces
except ImportError:  # pragma: no cover - depends on the host
    spaces = None


def gpu_task(fn):
    """Wrap `fn` in ZeroGPU's scheduler when running on ZeroGPU, otherwise leave it alone."""
    if spaces is None:
        return fn
    return spaces.GPU(duration=GPU_DURATION)(fn)


# Output resolutions. Both dimensions must be divisible by 64 -- DistilledPipeline is a
# two-stage pipeline, so stage 1 renders at half of these and stage 2 upsamples by 2x.
RESOLUTIONS = {
    "768 × 512 — landscape (fastest)": (768, 512),
    "1280 × 704 — landscape": (1280, 704),
    "704 × 1280 — portrait": (704, 1280),
    "960 × 960 — square": (960, 960),
    "1920 × 1088 — landscape HD": (1920, 1088),
}
DEFAULT_RESOLUTION = "1280 × 704 — landscape"

FRAME_RATES = [24, 25, 30, 50]

MAX_SEED = 2**31 - 1


# --------------------------------------------------------------------------------------
# Model loading
# --------------------------------------------------------------------------------------

_pipeline: DistilledPipeline | None = None
_pipeline_lock = threading.Lock()


def download_weights() -> dict[str, str]:
    """Fetch every component file, returning local paths keyed by component name.

    Runs outside the GPU scope on purpose: on ZeroGPU a download inside the worker
    would burn the GPU allocation, and the ~66 GiB pull only has to happen once.
    """
    paths: dict[str, str] = {}
    for name, filename in COMPONENT_FILES.items():
        logger.info("Fetching %s (%s)", name, filename)
        try:
            paths[name] = hf_hub_download(repo_id=MODEL_REPO, filename=filename, token=HF_TOKEN)
        except GatedRepoError as exc:
            raise RuntimeError(
                f"{MODEL_REPO} is gated. Accept the model terms on the Hub and set an HF_TOKEN "
                "secret with 'read gated repos' enabled on this Space."
            ) from exc
        except EntryNotFoundError as exc:
            raise RuntimeError(
                f"Could not find '{filename}' in {MODEL_REPO}. If the repo layout changed, "
                "override the path with the matching LTX_* environment variable."
            ) from exc
        except RepositoryNotFoundError as exc:
            raise RuntimeError(
                f"Model repository '{MODEL_REPO}' is not reachable. Set LTX_MODEL_REPO to a repo "
                "this Space can read, and provide an HF_TOKEN secret if it is private or gated."
            ) from exc
    return paths


def build_quantization(transformer_path: str) -> QuantizationPolicy | None:
    if not QUANTIZATION:
        return None
    return QuantizationKind(QUANTIZATION).to_policy(checkpoint_path=transformer_path)


def get_pipeline() -> DistilledPipeline:
    """Build the pipeline once and reuse it across requests."""
    global _pipeline
    with _pipeline_lock:
        if _pipeline is None:
            paths = download_weights()
            model_paths = ModelPaths.from_split(
                transformer_path=paths["transformer"],
                text_encoder_path=paths["text_encoder"],
                video_vae_path=paths["video_vae"],
                audio_vae_path=paths["audio_vae"],
                duration_head_path=paths["duration_head"],
            )
            logger.info("Loading LTX-2.5 (quantization=%s, offload=%s)", QUANTIZATION or "bf16", OFFLOAD)
            _pipeline = DistilledPipeline(
                model_paths=model_paths,
                spatial_upsampler_path=paths["spatial_upsampler"],
                loras=[],
                quantization=build_quantization(paths["transformer"]),
                offload_mode=OffloadMode(OFFLOAD),
            )
            logger.info("Pipeline ready")
    return _pipeline


# --------------------------------------------------------------------------------------
# Generation
# --------------------------------------------------------------------------------------


def snap_frames(seconds: float, fps: int) -> int:
    """Round a duration down to the nearest frame count the causal VAE accepts (8k + 1)."""
    frames = max(1, round(seconds * fps))
    return max(TEMPORAL_GRID + 1, ((frames - 1) // TEMPORAL_GRID) * TEMPORAL_GRID + 1)


@gpu_task
def generate(
    prompt: str,
    first_frame: str | None,
    resolution: str,
    auto_duration: bool,
    seconds: float,
    fps: int,
    seed: int,
    randomize_seed: bool,
    enhance_prompt: bool,
    progress: gr.Progress = gr.Progress(),  # noqa: B008 - Gradio injects this
) -> tuple[str, int]:
    prompt = (prompt or "").strip()
    if not prompt:
        raise gr.Error("Please write a prompt describing the shot you want.")

    if randomize_seed:
        seed = random.randint(0, MAX_SEED)
    seed = int(seed)

    width, height = RESOLUTIONS[resolution]
    fps = int(fps)
    num_frames = AutoDuration(min_seconds=1.0, max_seconds=MAX_SECONDS) if auto_duration else snap_frames(seconds, fps)

    images = []
    if first_frame:
        # frame_idx 0 pins the image as the opening frame; strength 1.0 keeps it verbatim.
        images.append(ImageConditioningInput(path=str(first_frame), frame_idx=0, strength=1.0))

    progress(0.05, desc="Loading LTX-2.5 (first run downloads ~66 GiB and takes a while)")
    pipeline = get_pipeline()

    progress(0.2, desc="Generating video and audio")
    try:
        video, audio, resolved_frames, tiling_config = pipeline(
            prompt=prompt,
            seed=seed,
            height=height,
            width=width,
            frame_rate=float(fps),
            images=images,
            num_frames=num_frames,
            enhance_prompt=enhance_prompt,
            tiling_config=AUTO_TILING,
        )
    except torch.cuda.OutOfMemoryError as exc:  # pragma: no cover - hardware dependent
        raise gr.Error(
            "Ran out of GPU memory. Try a smaller resolution or a shorter clip, or restart the "
            "Space with LTX_QUANTIZATION=fp8-cast and LTX_OFFLOAD=cpu."
        ) from exc

    progress(0.9, desc="Encoding MP4")
    output_path = Path(tempfile.mkdtemp(prefix="ltx25-")) / "output.mp4"
    encode_video(
        video=video,
        fps=fps,
        audio=audio,
        output_path=str(output_path),
        video_chunks_number=get_video_chunks_number(resolved_frames, tiling_config),
    )
    logger.info("Wrote %s (%d frames @ %d fps)", output_path, resolved_frames, fps)
    return str(output_path), seed


# --------------------------------------------------------------------------------------
# UI
# --------------------------------------------------------------------------------------

DESCRIPTION = """
# 🎬 LTX-2.5

Open-weights video generation from [**Lightricks/LTX-2.5**](https://huggingface.co/Lightricks/LTX-2.5) —
a 22B DiT that generates **video and synchronized audio in a single pass**. This demo runs the
distilled two-stage pipeline: stage 1 renders at half resolution, stage 2 upsamples 2× and refines.

Leave the image empty for **text-to-video**, or upload one to use it as the **first frame**.
The output MP4 carries the generated audio track — turn your sound on.
"""

PROMPT_TIPS = """
LTX responds to prompts written like a shot list: one flowing paragraph, in chronological order,
starting directly with the action. Describe movement and gestures, then appearances, then the
environment, then camera angle and movement, then lighting. Keep it under ~200 words, and quote any
dialogue you want spoken — the model generates the audio too. Full guide:
[prompting for LTX-2](https://ltx.io/blog/prompting-guide-for-ltx-2).
"""

EXAMPLES = [
    [
        "A close-up shot of a potter's hands shaping a tall clay vessel on a spinning wheel, fingers "
        "pressing steadily into the wet grey clay as the rim rises and thins. Water runs down the "
        "sides and pools on the wheel head. The potter's hands are weathered, streaked with slip. "
        "Behind them, a dim workshop wall is lined with unfired pots on wooden shelves. The camera "
        "holds a static macro view with a shallow depth of field, the wheel filling the lower frame. "
        "Warm afternoon light comes from a window on the left, catching the wet clay's sheen. The "
        "rhythmic hum of the wheel and the soft slap of wet clay fill the audio.",
        "1280 × 704 — landscape",
    ],
    [
        "A woman in a yellow raincoat walks briskly along a rain-slicked city street at night, her "
        "hood up, hands pushed into her pockets. Neon signs in red and blue reflect off the wet "
        "pavement in long smeared streaks. She glances over her shoulder once, then keeps walking. "
        "The camera tracks alongside her at shoulder height, moving at her pace, keeping her in the "
        "left third of the frame while the storefronts blur past on the right. Cool blue key light "
        "from a shop window rims her face; the rest of the street falls into deep shadow. Rain "
        "patters steadily and traffic hisses somewhere off screen.",
        "704 × 1280 — portrait",
    ],
    [
        "A tabby cat leaps from a kitchen counter onto a wooden floor, landing softly and immediately "
        "trotting toward the camera with its tail raised. Its ears swivel forward and it lets out a "
        "short, insistent meow. Morning sunlight falls in bright bars across the floorboards through "
        "half-open blinds, dust drifting through the beams. The camera sits low, near floor level, "
        "static, with the cat filling the centre of the frame as it approaches. Warm golden tones "
        "throughout, with soft shadows under the cabinets behind.",
        "768 × 512 — landscape (fastest)",
    ],
]


with gr.Blocks(title="LTX-2.5") as demo:
    gr.Markdown(DESCRIPTION)

    with gr.Row():
        with gr.Column(scale=3):
            prompt = gr.Textbox(
                label="Prompt",
                placeholder="Describe the shot: action first, then details, camera, and lighting…",
                lines=6,
            )
            first_frame = gr.Image(
                label="First frame (optional — leave empty for text-to-video)",
                type="filepath",
                height=200,
            )
            generate_btn = gr.Button("Generate", variant="primary")

            with gr.Accordion("Prompting tips", open=False):
                gr.Markdown(PROMPT_TIPS)

        with gr.Column(scale=3):
            output_video = gr.Video(label="Result", autoplay=True)

            resolution = gr.Dropdown(
                label="Resolution",
                choices=list(RESOLUTIONS),
                value=DEFAULT_RESOLUTION,
            )
            auto_duration = gr.Checkbox(
                label="Auto duration",
                value=True,
                info="Let the model's duration head pick the clip length from the prompt.",
            )
            seconds = gr.Slider(
                label="Duration (seconds)",
                minimum=1,
                maximum=MAX_SECONDS,
                step=0.5,
                value=5,
                visible=False,
            )

            with gr.Accordion("Advanced", open=False):
                fps = gr.Dropdown(label="Frame rate", choices=FRAME_RATES, value=24)
                enhance_prompt = gr.Checkbox(
                    label="Enhance prompt",
                    value=False,
                    info="Rewrite the prompt with the built-in enhancer before generating.",
                )
                randomize_seed = gr.Checkbox(label="Randomize seed", value=True)
                seed = gr.Slider(label="Seed", minimum=0, maximum=MAX_SEED, step=1, value=42)

    auto_duration.change(
        fn=lambda auto: gr.update(visible=not auto),
        inputs=auto_duration,
        outputs=seconds,
    )

    gr.Examples(examples=EXAMPLES, inputs=[prompt, resolution], label="Examples")

    gr.Markdown(
        "Weights and pipelines: [Lightricks/LTX-2.5](https://huggingface.co/Lightricks/LTX-2.5) · "
        "[Lightricks/LTX-2 on GitHub](https://github.com/Lightricks/LTX-2)"
    )

    generate_btn.click(
        fn=generate,
        inputs=[
            prompt,
            first_frame,
            resolution,
            auto_duration,
            seconds,
            fps,
            seed,
            randomize_seed,
            enhance_prompt,
        ],
        outputs=[output_video, seed],
    )


if __name__ == "__main__":
    # On dedicated hardware, load the weights up front so the first request is not a
    # multi-minute wait. ZeroGPU has no CUDA outside a @spaces.GPU worker, so there the
    # load happens lazily on the first generation instead.
    if not IS_ZERO_GPU and torch.cuda.is_available():
        get_pipeline()
    demo.queue().launch()
