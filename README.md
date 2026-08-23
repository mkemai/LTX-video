# LTX-video

A Hugging Face Space that demos [**Lightricks/LTX-2.5**](https://huggingface.co/Lightricks/LTX-2.5) —
the 22B open-weights DiT that generates video with synchronized audio in a single pass.

The complete Space lives in [`space/`](space/):

| File | What it is |
| --- | --- |
| [`space/README.md`](space/README.md) | Space card: YAML config, hardware requirements, and every `LTX_*` setting |
| [`space/app.py`](space/app.py) | Gradio UI wired to `DistilledPipeline` (text-to-video + first-frame image-to-video) |
| [`space/requirements.txt`](space/requirements.txt) | Python dependencies |

## Deploying

Create a Space on the Hub (Gradio SDK, a GPU with at least 80 GB, and persistent storage large
enough for the ~66 GiB of weights), then upload the directory contents as the Space root:

```bash
hf auth login
hf upload <your-username>/<space-name> ./space . --repo-type=space
```

Then, in the Space settings, add an `HF_TOKEN` **secret** — a read token with the "read gated
repos" scope, after accepting the LTX-2.5 model terms. The Space cannot fetch the weights without
it.

See [`space/README.md`](space/README.md) for hardware sizing, low-VRAM configuration, and the full
list of environment variables.
