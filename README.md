# AI Model Inspector

A lightweight static web app for inspecting AI model files directly in the browser. It is built with Vite and does not require a backend.

# Usage
Available at https://ai-model-inspector.com

Just access the site, upload the model and you are good to go. It does not require any install or compiling of source code. It runs directly in your browser.

## Features

- Inspect `.gguf` model headers, metadata entries, and tensor descriptors.
- Inspect `.onnx` model properties, graph inputs and outputs, nodes, and metadata.
- Estimate inference RAM from model weights, KV-cache structure, context length, and parallel sequences.
- Estimate LLM RAM or VRAM without a model file at `/llm-memory-estimator`.
- Project file size and total RAM requirements for common alternative GGUF quantizations.
- Search extracted metadata.
- Copy individual metadata values.
- Download the parsed result as JSON.
- Calculate a SHA-256 hash locally in a web worker.

## Privacy

Files are processed locally by the browser. The model parser does not upload model files to a server or call a model-inspection API, and the app does not require an account.

The hosted page loads Google AdSense, so ordinary page and advertising requests are separate from local model-file processing. See the site's privacy page for details.

Because parsing happens on-device, very large or malformed files may be slow or may exhaust browser memory.

## Run Locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The production files are emitted to `dist/` and can be hosted on any static web server.

To preview the production build locally:

```bash
npm run preview
```

## Supported Formats

- GGUF versions 2 and 3
- ONNX protobuf model files

## Development

The main application code lives in `src/main.js`. Format-specific parsers live in `src/ggufParser.js` and `src/onnxParser.js`, and SHA-256 hashing runs in `src/hashWorker.js`.

### Standalone memory planning

`src/manualEstimator.js` connects the static estimator form to `estimateManualLlmResources` in `src/resourceEstimator.js`. Users supply total stored parameters, weight quantization, attention layers, KV heads, key/value head dimensions, cached context, parallel sequences, and cache precision. Missing architecture values are rejected rather than inferred from a model name or parameter count.

- Weights: parameters × effective bits per weight ÷ 8. GGUF selections reuse the existing mixed-quantization ranges; custom effective bits can include storage overhead.
- KV cache: layers × KV heads × (key dimension + value dimension) × bytes per element × context tokens × parallel sequences.
- Total: weights + cache + max(10% of weights, 256 MiB), reusing the file estimator's runtime allowance.

Results use GiB (2³⁰ bytes) and show alternative CPU-only RAM and fully GPU-resident VRAM scenarios. They are estimates, not measured peaks. The model assumes identical dense full-attention decoder layers; partial offload, multi-GPU placement, hybrid/sliding-window attention, compressed/quantized caches, prefill activation peaks, and host loading copies are not modeled. Detailed assumptions and formulas are readable directly in the estimator's HTML.

The GGUF and ONNX landing pages are static files in `public/`; the estimator is a second Vite HTML entry. Firebase serves extensionless URLs using `cleanUrls`. The Vite configuration mirrors those routes in development and preview, including `/docs` → `/docs/index.html`.

## Deploy

```bash
firebase deploy
```

running on windows may need 

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Before the AI takes over the world, [you can buy me a coffee.](https://buymeacoffee.com/mejustandrew)
