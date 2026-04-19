import { createSHA256 } from 'hash-wasm';

const HASH_CHUNK_SIZE = 8 * 1024 * 1024;
const MIN_PROGRESS_INTERVAL_MS = 120;

async function hashFile(file) {
  const hasher = await createSHA256();
  hasher.init();

  let processedBytes = 0;
  let lastProgressSentAt = 0;

  for (let offset = 0; offset < file.size; offset += HASH_CHUNK_SIZE) {
    const end = Math.min(offset + HASH_CHUNK_SIZE, file.size);
    const chunk = new Uint8Array(await file.slice(offset, end).arrayBuffer());
    hasher.update(chunk);
    processedBytes = end;

    const now = Date.now();
    if (now - lastProgressSentAt >= MIN_PROGRESS_INTERVAL_MS || processedBytes === file.size) {
      self.postMessage({
        type: 'progress',
        processedBytes,
        totalBytes: file.size,
      });
      lastProgressSentAt = now;
    }
  }

  self.postMessage({
    type: 'complete',
    algorithm: 'SHA-256',
    value: hasher.digest(),
  });
}

self.onmessage = async (event) => {
  const { type, file } = event.data ?? {};
  if (type !== 'hash' || !(file instanceof File)) {
    return;
  }

  try {
    await hashFile(file);
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Failed to calculate SHA-256 hash.',
    });
  }
};
