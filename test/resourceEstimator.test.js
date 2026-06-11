import test from 'node:test';
import assert from 'node:assert/strict';

import {
  estimateInferenceResources,
  getDefaultInferenceSettings,
  getInferenceContextOptions,
} from '../src/resourceEstimator.js';

test('estimates GGUF weights and grouped-query KV cache from metadata', () => {
  const result = {
    kind: 'gguf',
    header: {
      fileSize: 7_000_000_000,
      tensorDataOffset: 4_000_000,
    },
    metadata: {
      'general.architecture': 'phi3',
      'phi3.context_length': 16384,
      'phi3.embedding_length': 5120,
      'phi3.block_count': 40,
      'phi3.attention.head_count': 40,
      'phi3.attention.head_count_kv': 10,
    },
  };

  assert.deepEqual(getDefaultInferenceSettings(result), {
    contextLength: 16384,
    batchSize: 1,
    contextSource: 'Declared model context',
  });
  assert.deepEqual(
    getInferenceContextOptions(result).map((option) => option.value),
    [512, 1024, 2048, 4096, 8192, 16384]
  );
  assert.equal(getInferenceContextOptions(result).at(-1).isModelMaximum, true);

  const estimate = estimateInferenceResources(result);
  assert.equal(estimate.weightsBytes, 6_996_000_000);
  assert.equal(estimate.kvCacheBytes, 3_355_443_200);
  assert.equal(
    estimate.estimatedTotalBytes,
    estimate.weightsBytes + estimate.kvCacheBytes + estimate.runtimeOverheadBytes
  );
});

test('estimates ONNX external weights and explicit present KV tensors', () => {
  const result = {
    kind: 'onnx',
    model: {
      graph: {
        initializers: [
          { dataType: 'float32', dimensions: ['100', '20'] },
          { dataType: 'uint4', dimensions: ['100', '20'] },
        ],
      },
    },
    graph: {
      interface: [
        {
          name: 'present.0.key',
          direction: 'Output',
          tensorType: {
            elementType: 'float16',
            dimensions: ['batch_size', '8', 'total_sequence_length', '128'],
          },
        },
        {
          name: 'present.0.value',
          direction: 'Output',
          tensorType: {
            elementType: 'float16',
            dimensions: ['batch_size', '8', 'total_sequence_length', '128'],
          },
        },
      ],
    },
  };

  const estimate = estimateInferenceResources(result, {
    contextLength: 4096,
    batchSize: 2,
  });

  assert.equal(estimate.weightsBytes, 9000);
  assert.equal(estimate.kvCacheBytes, 33_554_432);
  assert.equal(estimate.confidence, 'High');
  assert.deepEqual(
    getInferenceContextOptions(result).map((option) => option.value),
    [512, 1024, 2048, 4096, 8192, 16384, 32768]
  );
});

test('includes a non-power-of-two declared model maximum', () => {
  const result = {
    kind: 'gguf',
    metadata: {
      'general.architecture': 'custom',
      'custom.context_length': 12000,
    },
  };

  assert.deepEqual(getInferenceContextOptions(result), [
    { value: 512, isModelMaximum: false },
    { value: 1024, isModelMaximum: false },
    { value: 2048, isModelMaximum: false },
    { value: 4096, isModelMaximum: false },
    { value: 8192, isModelMaximum: false },
    { value: 12000, isModelMaximum: true },
  ]);
});
