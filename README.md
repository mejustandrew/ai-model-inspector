# AI Model Inspector

A lightweight static web app for inspecting AI model files directly in the browser. It is built with Vite and does not require a backend.

# Usage
Available at https://ai-model-inspector.web.app 

Just access the site, upload the model and you are good to go. It does not require any install or compiling of source code. It runs directly in your browser.

## Features

- Inspect `.gguf` model headers, metadata entries, and tensor descriptors.
- Inspect `.onnx` model properties, graph inputs and outputs, nodes, and metadata.
- Search extracted metadata.
- Copy individual metadata values.
- Download the parsed result as JSON.
- Calculate a SHA-256 hash locally in a web worker.

## Privacy

Files are processed locally by the browser. The app does not upload model files to a server, call an API, or require an account.

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
