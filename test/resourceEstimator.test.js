import test from 'node:test';
import assert from 'node:assert/strict';

import {
  estimateInferenceResources,
  getDefaultInferenceSettings,
  getGgufQuantizationRequirements,
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
    parallelSequences: 1,
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
    parallelSequences: 2,
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

test('projects common GGUF quantization requirements from tensor shapes', () => {
  const result = {
    kind: 'gguf',
    header: {
      fileSize: 2000,
      tensorDataOffset: 100,
    },
    metadata: {},
    tensors: [
      { dimensions: ['100', '20'] },
      { dimensions: ['10', '10'] },
    ],
  };

  const requirements = getGgufQuantizationRequirements(result, {
    contextLength: 4096,
    parallelSequences: 2,
  });

  assert.equal(requirements.parameterCount, 2100);
  assert.equal(requirements.currentBitsPerWeight, 1900 * 8 / 2100);
  assert.equal(requirements.contextLength, 4096);
  assert.equal(requirements.parallelSequences, 2);
  assert.equal(requirements.rows.length, 12);

  const q2 = requirements.rows.find((row) => row.name === 'Q2_K');
  assert.equal(q2.minimumFileBytes, 835);
  assert.equal(q2.maximumFileBytes, 940);
  assert.equal(q2.minimumTotalBytes, 735 + 256 * 1024 ** 2);
  assert.equal(q2.maximumTotalBytes, 840 + 256 * 1024 ** 2);
  assert.equal(
    requirements.rows.filter((row) => row.isClosestToUploaded).length,
    1
  );
});

test('does not project GGUF quantizations for ONNX models', () => {
  assert.equal(getGgufQuantizationRequirements({ kind: 'onnx' }), null);
});

test('updates projected totals with context length and parallel sequences', () => {
  const result = {
    kind: 'gguf',
    header: {
      fileSize: 1000,
      tensorDataOffset: 100,
    },
    metadata: {
      'general.architecture': 'test',
      'test.block_count': 1,
      'test.embedding_length': 8,
      'test.attention.head_count': 2,
    },
    tensors: [{ dimensions: ['100', '10'] }],
  };

  const singleSequence = getGgufQuantizationRequirements(result, {
    contextLength: 100,
    parallelSequences: 1,
  });
  const twoSequences = getGgufQuantizationRequirements(result, {
    contextLength: 100,
    parallelSequences: 2,
  });
  const q2Single = singleSequence.rows.find((row) => row.name === 'Q2_K');
  const q2Double = twoSequences.rows.find((row) => row.name === 'Q2_K');

  assert.equal(singleSequence.kvCacheBytes, 3200);
  assert.equal(twoSequences.kvCacheBytes, 6400);
  assert.equal(q2Double.minimumTotalBytes - q2Single.minimumTotalBytes, 3200);
});


test('manual estimator calculates weights, GQA cache and runtime totals', async () => {
  const { estimateManualLlmResources } = await import('../src/resourceEstimator.js');
  const inputs = { parameterCount: 8e9, quantization: 'custom', bitsPerWeight: 4.5,
    layerCount: 32, kvHeadCount: 8, keyLength: 128, valueLength: 128,
    contextLength: 4096, parallelSequences: 1, kvElementBytes: 2 };
  const result = estimateManualLlmResources(inputs);
  assert.equal(result.minimum.weightsBytes, 4_500_000_000);
  assert.equal(result.kvCacheBytes, 536_870_912);
  assert.equal(result.minimum.runtimeOverheadBytes, 450_000_000);
  assert.equal(result.minimum.estimatedTotalBytes, 5_486_870_912);
  assert.deepEqual(result.minimum, result.maximum);
  const scaled = estimateManualLlmResources({ ...inputs, contextLength: 8192, parallelSequences: 2, kvElementBytes: 4 });
  assert.equal(scaled.kvCacheBytes, result.kvCacheBytes * 8);
  assert.equal(scaled.minimum.weightsBytes, result.minimum.weightsBytes);
  const unequal = estimateManualLlmResources({ ...inputs, valueLength: 64 });
  assert.equal(unequal.kvCacheBytes, result.kvCacheBytes * 0.75);
});

test('manual estimator reuses quantization ranges and the minimum runtime allowance', async () => {
  const { estimateManualLlmResources } = await import('../src/resourceEstimator.js');
  const result = estimateManualLlmResources({ parameterCount: 1e6, quantization: 'Q4_K_M',
    layerCount: 1, kvHeadCount: 1, keyLength: 64, valueLength: 64,
    contextLength: 512, parallelSequences: 1, kvElementBytes: 2 });
  assert.equal(result.minimum.weightsBytes, 587500);
  assert.equal(result.maximum.weightsBytes, 637500);
  assert.equal(result.minimum.runtimeOverheadBytes, 256 * 1024 ** 2);
  assert.equal(result.maximum.estimatedTotalBytes - result.minimum.estimatedTotalBytes, 50000);
});

test('manual estimator rejects missing, invalid and overflowing inputs instead of guessing', async () => {
  const { estimateManualLlmResources } = await import('../src/resourceEstimator.js');
  const inputs = { parameterCount: 8e9, quantization: 'Q4_K_M', layerCount: 32,
    kvHeadCount: 8, keyLength: 128, valueLength: 128, contextLength: 4096,
    parallelSequences: 1, kvElementBytes: 2 };
  for (const field of ['parameterCount', 'layerCount', 'kvHeadCount', 'keyLength', 'valueLength', 'contextLength', 'parallelSequences', 'kvElementBytes']) {
    for (const invalid of [undefined, '', 0, -1, Infinity, NaN]) {
      assert.throws(() => estimateManualLlmResources({ ...inputs, [field]: invalid }), RangeError);
    }
  }
  assert.throws(() => estimateManualLlmResources({ ...inputs, layerCount: 1.5 }), RangeError);
  assert.throws(() => estimateManualLlmResources({ ...inputs, quantization: 'unknown' }), RangeError);
  assert.throws(() => estimateManualLlmResources({ ...inputs, quantization: 'custom' }), RangeError);
  assert.throws(() => estimateManualLlmResources({ ...inputs, contextLength: Number.MAX_SAFE_INTEGER }), RangeError);
  assert.throws(() => estimateManualLlmResources({ ...inputs, kvElementBytes: 0.5 }), RangeError);
});
