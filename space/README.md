---
title: LTX-2.5
emoji: 🎬
colorFrom: purple
colorTo: indigo
sdk: gradio
sdk_version: 6.25.0
app_file: app.py
pinned: false
license: other
short_description: Text- and image-to-video with synchronized audio, from LTX-2.5
suggested_hardware: a100-large
suggested_storage: large
models:
  - Lightricks/LTX-2.5
tags:
  - text-to-video
  - image-to-video
  - video-generation
  - audio-generation
  - ltx
---

# LTX-2.5 demo

A Gradio demo for [**Lightricks/LTX-2.5**](https://huggingface.co/Lightricks/LTX-2.5) — the 22B
open-weights DiT that generates **video and synchronized audio in a single pass**.

It runs `DistilledPipeline` from [Lightricks/LTX-2](https://github.com/Lightricks/LTX-2): stage 1
samples at half the target resolution over 8 predefined sigmas, stage 2 upsamples 2× with the
latent spatial upscaler and refines. Leave the image input empty for text-to-video, or upload one
to pin it as the first frame.

## Requirements

This is a large model, and the Space needs to be sized for it:

* **Weights: ~66 GiB.** The six component files are pulled from the Hub on first run, so the Space
  needs persistent storage at least that large (`suggested_storage: large`). Without it, every
  restart re-downloads them.
* **GPU.** `a100-large` (80 GB) works with the default `fp8-cast` quantization. On a smaller card,
  add CPU offload (see below). In bf16 with no offload the transformer alone is ~44 GB and the
  Gemma 4 text encoder another ~24 GB, so full bf16 wants an H200-class card.
* **A gated-repo token.** `Lightricks/LTX-2.5` requires accepting the model terms. Accept them on
  the model page, then add an `HF_TOKEN` secret to this Space using a **read** token with the
  "read gated repos" scope enabled. Without it, startup fails with a 401/403.

The first generation after a cold start includes the download and the weight load, so expect it to
take a while; later ones are just inference.

## Configuration

Everything is set through Space variables/secrets — no code changes needed.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HF_TOKEN` | — | **Required.** Read token with gated-repo access. Add it as a *secret*. |
| `LTX_QUANTIZATION` | `fp8-cast` | `fp8-cast`, `fp8-scaled-mm`, `nvfp4-cast`, `nvfp4-prequant`, or empty for bf16. |
| `LTX_OFFLOAD` | `none` | `cpu` or `disk` streams transformer weights to cut VRAM at the cost of speed. |
| `LTX_MAX_SECONDS` | `10` | Upper bound for clip length, and the ceiling for auto duration. |
| `LTX_GPU_DURATION` | `600` | ZeroGPU allocation in seconds. Must cover the first weight load too. |
| `LTX_MODEL_REPO` | `Lightricks/LTX-2.5` | Source repo for the weights. |
| `LTX_TRANSFORMER` | `diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors` | Transformer component. |
| `LTX_TEXT_ENCODER` | `text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors` | Gemma 4 text encoder. |
| `LTX_VIDEO_VAE` | `vae/ltx-2.5-video-vae-conv-bf16.safetensors` | Video VAE. Swap for the non-`conv` file to use the diffusion decoder (needs `natten`). |
| `LTX_AUDIO_VAE` | `vae/ltx-2.5-audio-vae-bf16.safetensors` | Audio VAE. |
| `LTX_SPATIAL_UPSAMPLER` | `latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors` | Stage-2 latent upscaler. |
| `LTX_DURATION_HEAD` | `model_patches/ltx-2.5-duration-head-bf16.safetensors` | Powers the "auto duration" toggle. |

### Tight on VRAM

```
LTX_QUANTIZATION=fp8-cast
LTX_OFFLOAD=cpu
```

`cpu` offload keeps the transformer pinned in system RAM and streams it layer by layer (~36 GB RAM
+ ~5 GB VRAM); `disk` is lower still but re-reads from disk every pass.

## Notes on the controls

* **Resolution** is the *output* resolution and both dimensions must be divisible by 64 — a
  two-stage requirement, since stage 1 renders at exactly half of it.
* **Duration** is snapped to the causal VAE's temporal grid, so the frame count is always `8k + 1`.
  With "auto duration" on, the model's duration head picks the length from the prompt instead.
* **Enhance prompt** rewrites your prompt with the model's built-in enhancer before generating.
* Prompts work best written like a shot list: one flowing paragraph, chronological, action first,
  then appearance, environment, camera, and lighting. Quote any dialogue you want spoken — the
  audio is generated alongside the video. See the
  [LTX-2 prompting guide](https://ltx.io/blog/prompting-guide-for-ltx-2).

## Running locally

```bash
pip install -r requirements.txt gradio==6.25.0
export HF_TOKEN=hf_...          # read token, gated-repo scope enabled
python app.py
```

On a machine with less than ~80 GB of VRAM, prefix with `LTX_OFFLOAD=cpu`.

## License

The demo code is MIT. The **weights** are covered by the LTX-2.5 license on the
[model page](https://huggingface.co/Lightricks/LTX-2.5) — free for organizations under $10M ARR,
negotiated above that. Read it before using the outputs commercially.
