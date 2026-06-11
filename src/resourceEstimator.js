const MEBIBYTE = 1024 ** 2;
const DEFAULT_ONNX_CONTEXT_LENGTH = 4096;
const DEFAULT_RUNTIME_OVERHEAD_RATIO = 0.1;
const MINIMUM_RUNTIME_OVERHEAD_BYTES = 256 * MEBIBYTE;
const CONTEXT_PRESETS = [
  512,
  1024,
  2048,
  4096,
  8192,
  16384,
  32768,
  65536,
  131072,
  262144,
  524288,
  1048576,
];
const FALLBACK_CONTEXT_MAX = 32768;
const GGUF_QUANTIZATION_PROFILES = [
  {
    name: 'Q2_K',
    minBitsPerWeight: 2.8,
    maxBitsPerWeight: 3.2,
    guidance: 'Smallest, highest quality loss',
  },
  {
    name: 'Q3_K_S',
    minBitsPerWeight: 3.3,
    maxBitsPerWeight: 3.7,
    guidance: 'Very small',
  },
  {
    name: 'Q3_K_M',
    minBitsPerWeight: 3.7,
    maxBitsPerWeight: 4.1,
    guidance: 'Small, more balanced',
  },
  {
    name: 'Q3_K_L',
    minBitsPerWeight: 4.1,
    maxBitsPerWeight: 4.5,
    guidance: 'Larger 3-bit mix',
  },
  {
    name: 'Q4_0',
    minBitsPerWeight: 4.4,
    maxBitsPerWeight: 4.7,
    guidance: 'Legacy 4-bit',
  },
  {
    name: 'Q4_K_S',
    minBitsPerWeight: 4.4,
    maxBitsPerWeight: 4.8,
    guidance: 'Balanced 4-bit',
  },
  {
    name: 'Q4_K_M',
    minBitsPerWeight: 4.7,
    maxBitsPerWeight: 5.1,
    guidance: 'Common quality/size default',
  },
  {
    name: 'Q5_K_S',
    minBitsPerWeight: 5.3,
    maxBitsPerWeight: 5.7,
    guidance: 'Higher quality',
  },
  {
    name: 'Q5_K_M',
    minBitsPerWeight: 5.6,
    maxBitsPerWeight: 6,
    guidance: 'Higher quality, larger mix',
  },
  {
    name: 'Q6_K',
    minBitsPerWeight: 6.5,
    maxBitsPerWeight: 6.9,
    guidance: 'Near-high precision',
  },
  {
    name: 'Q8_0',
    minBitsPerWeight: 8.3,
    maxBitsPerWeight: 8.7,
    guidance: 'Very high quality',
  },
  {
    name: 'F16 / BF16',
    minBitsPerWeight: 16,
    maxBitsPerWeight: 16.4,
    guidance: 'Source/highest precision',
  },
];

const ONNX_DATA_TYPE_BYTES = {
  float32: 4,
  uint8: 1,
  int8: 1,
  uint16: 2,
  int16: 2,
  int32: 4,
  int64: 8,
  bool: 1,
  float16: 2,
  float64: 8,
  uint32: 4,
  uint64: 8,
  complex64: 8,
  complex128: 16,
  bfloat16: 2,
  float8e4m3fn: 1,
  float8e4m3fnuz: 1,
  float8e5m2: 1,
  float8e5m2fnuz: 1,
  uint4: 0.5,
  int4: 0.5,
};

function finitePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function getMetadataNumber(metadata, key) {
  return finitePositiveNumber(metadata?.[key]);
}

function calculateOnnxWeights(initializers) {
  let bytes = 0;
  let countedTensors = 0;

  for (const tensor of initializers || []) {
    const bytesPerElement = ONNX_DATA_TYPE_BYTES[tensor.dataType];
    if (!bytesPerElement || tensor.dimensions.length === 0) {
      continue;
    }

    const elementCount = tensor.dimensions.reduce((product, dimension) => {
      const size = finitePositiveNumber(dimension);
      return size ? product * size : 0;
    }, 1);

    if (!elementCount) {
      continue;
    }

    bytes += Math.ceil(elementCount * bytesPerElement);
    countedTensors += 1;
  }

  return { bytes, countedTensors };
}

function isKvCacheTensor(item) {
  return (
    item.tensorType &&
    /(?:^|\.)(?:key|value)$/i.test(item.name) &&
    /^(?:present|past_key_values)(?:\.|$)/i.test(item.name)
  );
}

function calculateOnnxKvCache(interfaceItems, contextLength, parallelSequences) {
  const outputs = interfaceItems.filter(
    (item) => item.direction === 'Output' && isKvCacheTensor(item)
  );
  const cacheItems = outputs.length
    ? outputs
    : interfaceItems.filter((item) => item.direction === 'Input' && isKvCacheTensor(item));

  let bytes = 0;
  let unresolvedDimensions = 0;

  for (const item of cacheItems) {
    const bytesPerElement = ONNX_DATA_TYPE_BYTES[item.tensorType.elementType];
    if (!bytesPerElement) {
      continue;
    }

    let elementCount = 1;
    let foundSequenceDimension = false;

    for (const dimension of item.tensorType.dimensions) {
      const numericSize = finitePositiveNumber(dimension);
      if (numericSize) {
        elementCount *= numericSize;
        continue;
      }

      if (/batch/i.test(dimension)) {
        elementCount *= parallelSequences;
      } else if (/(?:past_|total_)?sequence|context/i.test(dimension)) {
        elementCount *= contextLength;
        foundSequenceDimension = true;
      } else {
        unresolvedDimensions += 1;
      }
    }

    if (foundSequenceDimension) {
      bytes += Math.ceil(elementCount * bytesPerElement);
    }
  }

  return {
    bytes,
    tensorCount: cacheItems.length,
    unresolvedDimensions,
  };
}

function estimateGguf(result, contextLength, parallelSequences) {
  const metadata = result.metadata || {};
  const architecture = metadata['general.architecture'];
  const prefix = architecture ? `${architecture}.` : '';
  const blockCount = getMetadataNumber(metadata, `${prefix}block_count`);
  const embeddingLength = getMetadataNumber(metadata, `${prefix}embedding_length`);
  const headCount = getMetadataNumber(metadata, `${prefix}attention.head_count`);
  const kvHeadCount =
    getMetadataNumber(metadata, `${prefix}attention.head_count_kv`) || headCount;
  const keyLength =
    getMetadataNumber(metadata, `${prefix}attention.key_length`) ||
    (embeddingLength && headCount ? embeddingLength / headCount : null);
  const valueLength =
    getMetadataNumber(metadata, `${prefix}attention.value_length`) || keyLength;
  const tensorDataOffset = finitePositiveNumber(result.header.tensorDataOffset) || 0;
  const weightsBytes = Math.max(0, result.header.fileSize - tensorDataOffset);

  let kvCacheBytes = 0;
  const notes = [
    'GGUF KV cache assumes 16-bit key and value storage, the common llama.cpp default.',
  ];

  if (blockCount && kvHeadCount && keyLength && valueLength) {
    kvCacheBytes =
      blockCount *
      kvHeadCount *
      (keyLength + valueLength) *
      2 *
      contextLength *
      parallelSequences;
  } else {
    notes.push('KV cache could not be derived from the available architecture metadata.');
  }

  return {
    weightsBytes,
    kvCacheBytes,
    confidence: kvCacheBytes ? 'High' : 'Medium',
    notes,
    details: {
      architecture: architecture || 'unknown',
      blockCount,
      kvHeadCount,
      keyLength,
      valueLength,
      kvElementBytes: 2,
    },
  };
}

function calculateGgufParameterCount(tensors) {
  let parameterCount = 0;

  for (const tensor of tensors || []) {
    if (!Array.isArray(tensor.dimensions) || tensor.dimensions.length === 0) {
      continue;
    }

    const tensorParameters = tensor.dimensions.reduce((product, dimension) => {
      const size = finitePositiveNumber(dimension);
      return size ? product * size : 0;
    }, 1);

    if (!Number.isSafeInteger(tensorParameters) || tensorParameters <= 0) {
      return null;
    }

    parameterCount += tensorParameters;
    if (!Number.isSafeInteger(parameterCount)) {
      return null;
    }
  }

  return parameterCount || null;
}

function calculateRuntimeOverhead(weightsBytes) {
  return Math.max(
    MINIMUM_RUNTIME_OVERHEAD_BYTES,
    weightsBytes * DEFAULT_RUNTIME_OVERHEAD_RATIO
  );
}

function calculateProjectedTotal(weightsBytes, kvCacheBytes) {
  return weightsBytes + kvCacheBytes + calculateRuntimeOverhead(weightsBytes);
}

function estimateOnnx(result, contextLength, parallelSequences) {
  const initializers = result.model?.graph?.initializers || [];
  const weights = calculateOnnxWeights(initializers);
  const kvCache = calculateOnnxKvCache(
    result.graph?.interface || [],
    contextLength,
    parallelSequences
  );
  const notes = [
    'ONNX weight memory is calculated from initializer shapes and data types, including external-data tensors.',
  ];

  if (!kvCache.tensorCount) {
    notes.push('No explicit past/present key-value cache tensors were found in the graph interface.');
  }

  if (kvCache.unresolvedDimensions) {
    notes.push('Unknown non-batch cache dimensions were treated as size 1.');
  }

  return {
    weightsBytes: weights.bytes,
    kvCacheBytes: kvCache.bytes,
    confidence:
      weights.countedTensors === initializers.length &&
      kvCache.tensorCount &&
      !kvCache.unresolvedDimensions
        ? 'High'
        : 'Medium',
    notes,
    details: {
      initializerCount: initializers.length,
      countedInitializerCount: weights.countedTensors,
      kvTensorCount: kvCache.tensorCount,
    },
  };
}

export function getDefaultInferenceSettings(result) {
  if (result.kind === 'gguf') {
    const architecture = result.metadata?.['general.architecture'];
    const declaredContext = architecture
      ? getMetadataNumber(result.metadata, `${architecture}.context_length`)
      : null;

    return {
      contextLength: declaredContext || DEFAULT_ONNX_CONTEXT_LENGTH,
      parallelSequences: 1,
      contextSource: declaredContext ? 'Declared model context' : 'Assumed context',
    };
  }

  return {
    contextLength: DEFAULT_ONNX_CONTEXT_LENGTH,
    parallelSequences: 1,
    contextSource: 'Assumed context',
  };
}

export function getInferenceContextOptions(result) {
  const defaults = getDefaultInferenceSettings(result);
  const hasDeclaredMaximum = defaults.contextSource === 'Declared model context';
  const maximum = hasDeclaredMaximum ? defaults.contextLength : FALLBACK_CONTEXT_MAX;
  const options = CONTEXT_PRESETS.filter((value) => value <= maximum);

  if (!options.includes(maximum)) {
    options.push(maximum);
  }

  return options
    .sort((left, right) => left - right)
    .map((value) => ({
      value,
      isModelMaximum: hasDeclaredMaximum && value === maximum,
    }));
}

export function estimateInferenceResources(result, settings = {}) {
  const defaults = getDefaultInferenceSettings(result);
  const contextLength =
    finitePositiveNumber(settings.contextLength) || defaults.contextLength;
  const parallelSequences =
    finitePositiveNumber(settings.parallelSequences) ||
    finitePositiveNumber(settings.batchSize) ||
    defaults.parallelSequences;
  const formatEstimate =
    result.kind === 'gguf'
      ? estimateGguf(result, contextLength, parallelSequences)
      : estimateOnnx(result, contextLength, parallelSequences);
  const runtimeOverheadBytes = calculateRuntimeOverhead(formatEstimate.weightsBytes);
  const coreBytes = formatEstimate.weightsBytes + formatEstimate.kvCacheBytes;

  return {
    contextLength,
    parallelSequences,
    contextSource:
      settings.contextSource ||
      (settings.contextLength ? 'Selected context' : defaults.contextSource),
    weightsBytes: formatEstimate.weightsBytes,
    kvCacheBytes: formatEstimate.kvCacheBytes,
    coreBytes,
    runtimeOverheadBytes,
    estimatedTotalBytes: coreBytes + runtimeOverheadBytes,
    confidence: formatEstimate.confidence,
    notes: [
      ...formatEstimate.notes,
      'The total adds a 10% weight-memory allowance (minimum 256 MiB) for runtime buffers.',
      'Actual RAM depends on the inference engine, memory mapping, cache precision, and CPU/GPU offload.',
    ],
    details: formatEstimate.details,
  };
}

export function getGgufQuantizationRequirements(result, settings = {}) {
  if (result.kind !== 'gguf') {
    return null;
  }

  const parameterCount = calculateGgufParameterCount(result.tensors);
  if (!parameterCount) {
    return null;
  }

  const currentEstimate = estimateInferenceResources(result, settings);
  const tensorDataOffset = finitePositiveNumber(result.header.tensorDataOffset) || 0;
  const currentBitsPerWeight = (currentEstimate.weightsBytes * 8) / parameterCount;
  const rows = GGUF_QUANTIZATION_PROFILES.map((profile) => {
    const minimumWeightsBytes = parameterCount * profile.minBitsPerWeight / 8;
    const maximumWeightsBytes = parameterCount * profile.maxBitsPerWeight / 8;
    const midpointBitsPerWeight =
      (profile.minBitsPerWeight + profile.maxBitsPerWeight) / 2;

    return {
      ...profile,
      minimumFileBytes: minimumWeightsBytes + tensorDataOffset,
      maximumFileBytes: maximumWeightsBytes + tensorDataOffset,
      minimumTotalBytes: calculateProjectedTotal(
        minimumWeightsBytes,
        currentEstimate.kvCacheBytes
      ),
      maximumTotalBytes: calculateProjectedTotal(
        maximumWeightsBytes,
        currentEstimate.kvCacheBytes
      ),
      distanceFromCurrentBits: Math.abs(midpointBitsPerWeight - currentBitsPerWeight),
    };
  });
  const closestDistance = Math.min(...rows.map((row) => row.distanceFromCurrentBits));

  return {
    parameterCount,
    currentBitsPerWeight,
    currentFileBytes: result.header.fileSize,
    currentTotalBytes: currentEstimate.estimatedTotalBytes,
    kvCacheBytes: currentEstimate.kvCacheBytes,
    contextLength: currentEstimate.contextLength,
    parallelSequences: currentEstimate.parallelSequences,
    rows: rows.map((row) => ({
      ...row,
      isClosestToUploaded: row.distanceFromCurrentBits === closestDistance,
    })),
    notes: [
      'Projected sizes use effective bits-per-weight ranges for common mixed GGUF quantizations.',
      'Exact output size varies by architecture, quantizer version, tensor mix, and alignment.',
      'Quantize from F16 or BF16 when possible; requantizing an already quantized model compounds quality loss.',
    ],
  };
}
