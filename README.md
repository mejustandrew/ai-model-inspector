# GGUF Metadata Inspector

A small Vite application that parses GGUF files in the browser and extracts:

- GGUF header information
- Metadata key-value entries
- Tensor descriptor index

No backend is required. The site is static and processes files locally in the browser.

## Run locally

```bash
npm install
npm run dev
```

## Build for static hosting

```bash
npm run build
```

The production files are emitted to `dist/` and can be hosted on any static web server.
