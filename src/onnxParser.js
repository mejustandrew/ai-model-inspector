const TEXT_DECODER = new TextDecoder('utf-8', { fatal: false });
const VARINT_SHIFT_STEP = BigInt(7);
const MAX_VARINT_SHIFT = BigInt(70);
const ZERO_BIGINT = BigInt(0);

const TENSOR_DATA_TYPES = {
  0: 'undefined',
  1: 'float32',
  2: 'uint8',
  3: 'int8',
  4: 'uint16',
  5: 'int16',
  6: 'int32',
  7: 'int64',
  8: 'string',
  9: 'bool',
  10: 'float16',
  11: 'float64',
  12: 'uint32',
  13: 'uint64',
  14: 'complex64',
  15: 'complex128',
  16: 'bfloat16',
  17: 'float8e4m3fn',
  18: 'float8e4m3fnuz',
  19: 'float8e5m2',
  20: 'float8e5m2fnuz',
  21: 'uint4',
  22: 'int4',
};

class ProtoReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.offset = 0;
  }

  eof() {
    return this.offset >= this.bytes.length;
  }

  readByte() {
    if (this.eof()) {
      throw new Error('Unexpected end of ONNX protobuf data');
    }

    return this.bytes[this.offset++];
  }

  readVarint() {
    let shift = ZERO_BIGINT;
    let result = ZERO_BIGINT;

    while (true) {
      const byte = this.readByte();
      result |= BigInt(byte & 0x7f) << shift;

      if ((byte & 0x80) === 0) {
        return result;
      }

      shift += VARINT_SHIFT_STEP;
      if (shift > MAX_VARINT_SHIFT) {
        throw new Error('Invalid ONNX protobuf varint');
      }
    }
  }

  readTag() {
    if (this.eof()) {
      return null;
    }

    const tag = Number(this.readVarint());
    return {
      fieldNumber: tag >> 3,
      wireType: tag & 0x07,
    };
  }

  readLengthDelimitedBytes() {
    const length = Number(this.readVarint());
    const end = this.offset + length;

    if (end > this.bytes.length) {
      throw new Error('Unexpected end of ONNX protobuf length-delimited field');
    }

    const value = this.bytes.slice(this.offset, end);
    this.offset = end;
    return value;
  }

  readString() {
    return TEXT_DECODER.decode(this.readLengthDelimitedBytes());
  }

  skipField(wireType) {
    switch (wireType) {
      case 0:
        this.readVarint();
        return;
      case 1:
        this.offset += 8;
        return;
      case 2: {
        const length = Number(this.readVarint());
        this.offset += length;
        return;
      }
      case 5:
        this.offset += 4;
        return;
      default:
        throw new Error(`Unsupported ONNX protobuf wire type: ${wireType}`);
    }
  }
}

function formatInt64(value) {
  return value.toString();
}

function readSubMessage(reader) {
  return new ProtoReader(reader.readLengthDelimitedBytes());
}

function parseStringStringEntry(reader) {
  const entry = { key: '', value: '' };

  while (!reader.eof()) {
    const tag = reader.readTag();
    if (!tag) {
      break;
    }

    switch (tag.fieldNumber) {
      case 1:
        entry.key = reader.readString();
        break;
      case 2:
        entry.value = reader.readString();
        break;
      default:
        reader.skipField(tag.wireType);
        break;
    }
  }

  return entry;
}

function parseOperatorSetId(reader) {
  const opset = { domain: '', version: '0' };

  while (!reader.eof()) {
    const tag = reader.readTag();
    if (!tag) {
      break;
    }

    switch (tag.fieldNumber) {
      case 1:
        opset.domain = reader.readString();
        break;
      case 2:
        opset.version = formatInt64(reader.readVarint());
        break;
      default:
        reader.skipField(tag.wireType);
        break;
    }
  }

  return opset;
}

function parseTensorShape(reader) {
  const dims = [];

  while (!reader.eof()) {
    const tag = reader.readTag();
    if (!tag) {
      break;
    }

    if (tag.fieldNumber === 1 && tag.wireType === 2) {
      const dimReader = readSubMessage(reader);
      let dimValue = '?';

      while (!dimReader.eof()) {
        const dimTag = dimReader.readTag();
        if (!dimTag) {
          break;
        }

        switch (dimTag.fieldNumber) {
          case 1:
            dimValue = formatInt64(dimReader.readVarint());
            break;
          case 2:
            dimValue = dimReader.readString();
            break;
          default:
            dimReader.skipField(dimTag.wireType);
            break;
        }
      }

      dims.push(dimValue);
      continue;
    }

    reader.skipField(tag.wireType);
  }

  return dims;
}

function parseTensorType(reader) {
  let elemType = 'undefined';
  let shape = [];

  while (!reader.eof()) {
    const tag = reader.readTag();
    if (!tag) {
      break;
    }

    switch (tag.fieldNumber) {
      case 1:
        elemType = TENSOR_DATA_TYPES[Number(reader.readVarint())] || 'unknown';
        break;
      case 2:
        shape = parseTensorShape(readSubMessage(reader));
        break;
      default:
        reader.skipField(tag.wireType);
        break;
    }
  }

  const shapeText = shape.length > 0 ? `[${shape.join(', ')}]` : '';
  return `tensor<${elemType}${shapeText}>`;
}

function parseSequenceType(reader) {
  let elementType = 'unknown';

  while (!reader.eof()) {
    const tag = reader.readTag();
    if (!tag) {
      break;
    }

    if (tag.fieldNumber === 1 && tag.wireType === 2) {
      elementType = parseTypeProto(readSubMessage(reader));
    } else {
      reader.skipField(tag.wireType);
    }
  }

  return `sequence<${elementType}>`;
}

function parseOptionalType(reader) {
  let elementType = 'unknown';

  while (!reader.eof()) {
    const tag = reader.readTag();
    if (!tag) {
      break;
    }

    if (tag.fieldNumber === 1 && tag.wireType === 2) {
      elementType = parseTypeProto(readSubMessage(reader));
    } else {
      reader.skipField(tag.wireType);
    }
  }

  return `optional<${elementType}>`;
}

function parseMapType(reader) {
  let keyType = 'unknown';
  let valueType = 'unknown';

  while (!reader.eof()) {
    const tag = reader.readTag();
    if (!tag) {
      break;
    }

    switch (tag.fieldNumber) {
      case 1:
        keyType = TENSOR_DATA_TYPES[Number(reader.readVarint())] || 'unknown';
        break;
      case 2:
        valueType = parseTypeProto(readSubMessage(reader));
        break;
      default:
        reader.skipField(tag.wireType);
        break;
    }
  }

  return `map<${keyType}, ${valueType}>`;
}

function parseTypeProto(reader) {
  while (!reader.eof()) {
    const tag = reader.readTag();
    if (!tag) {
      break;
    }

    switch (tag.fieldNumber) {
      case 1:
      case 8:
        return parseTensorType(readSubMessage(reader));
      case 2:
        return parseSequenceType(readSubMessage(reader));
      case 3:
        return parseMapType(readSubMessage(reader));
      case 9:
        return parseOptionalType(readSubMessage(reader));
      default:
        reader.skipField(tag.wireType);
        break;
    }
  }

  return 'unknown';
}

function parseValueInfo(reader) {
  const info = {
    name: '',
    typeDescription: 'unknown',
    docString: '',
  };

  while (!reader.eof()) {
    const tag = reader.readTag();
    if (!tag) {
      break;
    }

    switch (tag.fieldNumber) {
      case 1:
        info.name = reader.readString();
        break;
      case 2:
        info.typeDescription = parseTypeProto(readSubMessage(reader));
        break;
      case 3:
        info.docString = reader.readString();
        break;
      default:
        reader.skipField(tag.wireType);
        break;
    }
  }

  return info;
}

function parseTensorProto(reader) {
  const tensor = {
    name: '',
    dataType: 'undefined',
    dimensions: [],
  };

  while (!reader.eof()) {
    const tag = reader.readTag();
    if (!tag) {
      break;
    }

    switch (tag.fieldNumber) {
      case 1:
        tensor.dimensions.push(formatInt64(reader.readVarint()));
        break;
      case 2:
        tensor.dataType = TENSOR_DATA_TYPES[Number(reader.readVarint())] || 'unknown';
        break;
      case 8:
        tensor.name = reader.readString();
        break;
      default:
        reader.skipField(tag.wireType);
        break;
    }
  }

  return tensor;
}

function parseNodeProto(reader) {
  const node = {
    inputs: [],
    outputs: [],
    name: '',
    opType: '',
    domain: '',
    attributeCount: 0,
  };

  while (!reader.eof()) {
    const tag = reader.readTag();
    if (!tag) {
      break;
    }

    switch (tag.fieldNumber) {
      case 1:
        node.inputs.push(reader.readString());
        break;
      case 2:
        node.outputs.push(reader.readString());
        break;
      case 3:
        node.name = reader.readString();
        break;
      case 4:
        node.opType = reader.readString();
        break;
      case 5:
        node.attributeCount += 1;
        reader.skipField(tag.wireType);
        break;
      case 7:
        node.domain = reader.readString();
        break;
      default:
        reader.skipField(tag.wireType);
        break;
    }
  }

  return node;
}

function parseGraphProto(reader) {
  const graph = {
    name: '',
    docString: '',
    inputs: [],
    outputs: [],
    nodes: [],
    initializers: [],
    valueInfos: [],
    initializerCount: 0,
    sparseInitializerCount: 0,
    valueInfoCount: 0,
  };

  while (!reader.eof()) {
    const tag = reader.readTag();
    if (!tag) {
      break;
    }

    switch (tag.fieldNumber) {
      case 1:
        graph.nodes.push(parseNodeProto(readSubMessage(reader)));
        break;
      case 2:
        graph.name = reader.readString();
        break;
      case 5:
        graph.initializerCount += 1;
        graph.initializers.push(parseTensorProto(readSubMessage(reader)));
        break;
      case 10:
        graph.docString = reader.readString();
        break;
      case 11:
        graph.inputs.push(parseValueInfo(readSubMessage(reader)));
        break;
      case 12:
        graph.outputs.push(parseValueInfo(readSubMessage(reader)));
        break;
      case 13:
        graph.valueInfoCount += 1;
        graph.valueInfos.push(parseValueInfo(readSubMessage(reader)));
        break;
      case 15:
        graph.sparseInitializerCount += 1;
        reader.skipField(tag.wireType);
        break;
      default:
        reader.skipField(tag.wireType);
        break;
    }
  }

  return graph;
}

function parseModelProto(reader) {
  const model = {
    irVersion: 'unknown',
    producerName: '',
    producerVersion: '',
    domain: '',
    modelVersion: '0',
    docString: '',
    opsets: [],
    graph: {
      name: '',
      inputs: [],
      outputs: [],
      nodes: [],
      initializers: [],
      valueInfos: [],
      initializerCount: 0,
      sparseInitializerCount: 0,
      valueInfoCount: 0,
    },
    metadataProps: [],
  };

  while (!reader.eof()) {
    const tag = reader.readTag();
    if (!tag) {
      break;
    }

    switch (tag.fieldNumber) {
      case 1:
        model.irVersion = formatInt64(reader.readVarint());
        break;
      case 2:
        model.producerName = reader.readString();
        break;
      case 3:
        model.producerVersion = reader.readString();
        break;
      case 4:
        model.domain = reader.readString();
        break;
      case 5:
        model.modelVersion = formatInt64(reader.readVarint());
        break;
      case 6:
        model.docString = reader.readString();
        break;
      case 7:
        model.graph = parseGraphProto(readSubMessage(reader));
        break;
      case 8:
        model.opsets.push(parseOperatorSetId(readSubMessage(reader)));
        break;
      case 14:
        model.metadataProps.push(parseStringStringEntry(readSubMessage(reader)));
        break;
      default:
        reader.skipField(tag.wireType);
        break;
    }
  }

  return model;
}

function buildMetadataEntries(model) {
  const entries = [
    {
      key: 'onnx.ir_version',
      valueTypeName: 'string',
      arrayElementTypeName: null,
      value: model.irVersion,
    },
    {
      key: 'onnx.model_version',
      valueTypeName: 'string',
      arrayElementTypeName: null,
      value: model.modelVersion,
    },
    {
      key: 'onnx.producer_name',
      valueTypeName: 'string',
      arrayElementTypeName: null,
      value: model.producerName || '',
    },
    {
      key: 'onnx.producer_version',
      valueTypeName: 'string',
      arrayElementTypeName: null,
      value: model.producerVersion || '',
    },
    {
      key: 'onnx.domain',
      valueTypeName: 'string',
      arrayElementTypeName: null,
      value: model.domain || '',
    },
    {
      key: 'onnx.graph_name',
      valueTypeName: 'string',
      arrayElementTypeName: null,
      value: model.graph.name || '',
    },
    {
      key: 'onnx.opsets',
      valueTypeName: 'array',
      arrayElementTypeName: 'string',
      value: model.opsets.map((opset) =>
        opset.domain ? `${opset.domain}:${opset.version}` : `ai.onnx:${opset.version}`
      ),
    },
    {
      key: 'onnx.initializer_count',
      valueTypeName: 'string',
      arrayElementTypeName: null,
      value: String(model.graph.initializerCount),
    },
    {
      key: 'onnx.sparse_initializer_count',
      valueTypeName: 'string',
      arrayElementTypeName: null,
      value: String(model.graph.sparseInitializerCount),
    },
    {
      key: 'onnx.value_info_count',
      valueTypeName: 'string',
      arrayElementTypeName: null,
      value: String(model.graph.valueInfoCount),
    },
  ];

  if (model.docString) {
    entries.push({
      key: 'onnx.doc_string',
      valueTypeName: 'string',
      arrayElementTypeName: null,
      value: model.docString,
    });
  }

  for (const prop of model.metadataProps) {
    entries.push({
      key: prop.key,
      valueTypeName: 'string',
      arrayElementTypeName: null,
      value: prop.value,
    });
  }

  return entries;
}

function addUnique(list, value) {
  if (value && !list.includes(value)) {
    list.push(value);
  }
}

function sortedValues(values) {
  return Array.from(values).sort((left, right) => left.localeCompare(right));
}

function createTensorInfo(name, kind = 'Intermediate') {
  return {
    name,
    kind,
    typeDescription: '',
    producerNodeIds: [],
    consumerNodeIds: [],
  };
}

function mergeTensorInfo(tensorsByName, name, updates = {}) {
  if (!name) {
    return null;
  }

  const existing = tensorsByName.get(name) || createTensorInfo(name);
  Object.assign(existing, updates);
  tensorsByName.set(name, existing);
  return existing;
}

function buildTraceFromStarts({ starts, direction, nodesById, tensorsByName }) {
  const visitedTensorNames = new Set();
  const visitedNodeIds = new Set();
  const edges = [];
  const queue = starts.map((name) => ({ type: 'tensor', name, depth: 0 }));
  const tensorDepths = new Map(starts.map((name) => [name, 0]));
  const nodeDepths = new Map();

  while (queue.length > 0) {
    const current = queue.shift();

    if (current.type === 'tensor') {
      const knownDepth = tensorDepths.get(current.name);
      const depth = knownDepth === undefined ? current.depth : Math.min(knownDepth, current.depth);
      tensorDepths.set(current.name, depth);

      if (visitedTensorNames.has(current.name)) {
        continue;
      }

      visitedTensorNames.add(current.name);
      const tensor = tensorsByName.get(current.name);
      const nextNodeIds = direction === 'forward' ? tensor?.consumerNodeIds || [] : tensor?.producerNodeIds || [];

      for (const nodeId of nextNodeIds) {
        const nodeDepth = depth + 1;
        const previousDepth = nodeDepths.get(nodeId);
        if (previousDepth === undefined || nodeDepth < previousDepth) {
          nodeDepths.set(nodeId, nodeDepth);
        }

        edges.push({ fromType: 'tensor', from: current.name, toType: 'node', to: nodeId });
        queue.push({ type: 'node', id: nodeId, depth: nodeDepth });
      }

      continue;
    }

    const knownDepth = nodeDepths.get(current.id);
    const depth = knownDepth === undefined ? current.depth : Math.min(knownDepth, current.depth);
    nodeDepths.set(current.id, depth);

    if (visitedNodeIds.has(current.id)) {
      continue;
    }

    visitedNodeIds.add(current.id);
    const node = nodesById.get(current.id);
    const nextTensorNames = direction === 'forward' ? node?.outputs || [] : node?.inputs || [];

    for (const tensorName of nextTensorNames) {
      const tensorDepth = depth + 1;
      const previousDepth = tensorDepths.get(tensorName);
      if (previousDepth === undefined || tensorDepth < previousDepth) {
        tensorDepths.set(tensorName, tensorDepth);
      }

      edges.push({ fromType: 'node', from: current.id, toType: 'tensor', to: tensorName });
      queue.push({ type: 'tensor', name: tensorName, depth: tensorDepth });
    }
  }

  return {
    tensorNames: sortedValues(visitedTensorNames),
    nodeIds: Array.from(visitedNodeIds).sort((left, right) => left - right),
    edges,
    tensorDepths: Object.fromEntries(tensorDepths),
    nodeDepths: Object.fromEntries(Array.from(nodeDepths, ([key, value]) => [String(key), value])),
  };
}

function summarizeTrace({ starts, endpoints, trace, nodesById, tensorsByName, endpointKind }) {
  return endpoints.map((endpoint) => {
    const subTrace = buildTraceFromStarts({
      starts: [endpoint],
      direction: endpointKind === 'output' ? 'backward' : 'forward',
      nodesById,
      tensorsByName,
    });
    const tensorSet = new Set(subTrace.tensorNames);
    const connectedStarts = starts.filter((name) => tensorSet.has(name));
    const initializerNames = subTrace.tensorNames.filter(
      (name) => tensorsByName.get(name)?.kind === 'Initializer'
    );
    const opTypes = new Set(
      subTrace.nodeIds.map((nodeId) => nodesById.get(nodeId)?.opType).filter(Boolean)
    );
    const depths = [
      ...Object.values(subTrace.tensorDepths),
      ...Object.values(subTrace.nodeDepths),
    ];

    return {
      name: endpoint,
      connectedStarts,
      initializerNames,
      nodeCount: subTrace.nodeIds.length,
      tensorCount: subTrace.tensorNames.length,
      maxDepth: depths.length > 0 ? Math.max(...depths) : 0,
      opTypes: sortedValues(opTypes),
      isReachableInFullTrace: trace.tensorNames.includes(endpoint),
    };
  });
}

function buildDependencyTrace(model) {
  const tensorsByName = new Map();
  const nodesById = new Map();
  const graphOutputNames = model.graph.outputs.map((item) => item.name).filter(Boolean);
  const initializerNames = model.graph.initializers.map((item) => item.name).filter(Boolean);
  const initializerNameSet = new Set(initializerNames);
  const declaredGraphInputNames = model.graph.inputs.map((item) => item.name).filter(Boolean);
  const graphInputNames = declaredGraphInputNames.filter((name) => !initializerNameSet.has(name));

  for (const input of model.graph.inputs) {
    mergeTensorInfo(tensorsByName, input.name, {
      kind: initializerNameSet.has(input.name) ? 'InitializerInput' : 'Input',
      typeDescription: input.typeDescription,
    });
  }

  for (const output of model.graph.outputs) {
    mergeTensorInfo(tensorsByName, output.name, {
      kind: 'Output',
      typeDescription: output.typeDescription,
    });
  }

  for (const valueInfo of model.graph.valueInfos) {
    mergeTensorInfo(tensorsByName, valueInfo.name, {
      typeDescription: valueInfo.typeDescription,
    });
  }

  for (const initializer of model.graph.initializers) {
    mergeTensorInfo(tensorsByName, initializer.name, {
      kind: tensorsByName.get(initializer.name)?.kind === 'Input' ? 'InitializerInput' : 'Initializer',
      typeDescription: `tensor<${initializer.dataType}${
        initializer.dimensions.length > 0 ? `[${initializer.dimensions.join(', ')}]` : ''
      }>`,
    });
  }

  model.graph.nodes.forEach((node, index) => {
    const nodeInfo = {
      id: index,
      name: node.name || `node_${index}`,
      label: node.name || `${node.opType || 'Node'} #${index + 1}`,
      opType: node.opType || 'unknown',
      domain: node.domain,
      inputs: node.inputs,
      outputs: node.outputs,
      attributeCount: node.attributeCount,
    };
    nodesById.set(index, nodeInfo);

    for (const inputName of node.inputs) {
      const tensor = mergeTensorInfo(tensorsByName, inputName);
      if (tensor) {
        addUnique(tensor.consumerNodeIds, index);
      }
    }

    for (const outputName of node.outputs) {
      const tensor = mergeTensorInfo(tensorsByName, outputName);
      if (tensor) {
        addUnique(tensor.producerNodeIds, index);
      }
    }
  });

  const forward = buildTraceFromStarts({
    starts: graphInputNames,
    direction: 'forward',
    nodesById,
    tensorsByName,
  });
  const backward = buildTraceFromStarts({
    starts: graphOutputNames,
    direction: 'backward',
    nodesById,
    tensorsByName,
  });

  return {
    graphInputNames,
    declaredGraphInputNames,
    graphOutputNames,
    initializerNames,
    tensors: Array.from(tensorsByName.values()).sort((left, right) =>
      left.name.localeCompare(right.name)
    ),
    nodes: Array.from(nodesById.values()),
    forward,
    backward,
    outputSummaries: summarizeTrace({
      starts: graphInputNames,
      endpoints: graphOutputNames,
      trace: forward,
      nodesById,
      tensorsByName,
      endpointKind: 'output',
    }),
    inputSummaries: summarizeTrace({
      starts: graphOutputNames,
      endpoints: graphInputNames,
      trace: backward,
      nodesById,
      tensorsByName,
      endpointKind: 'input',
    }),
  };
}

export async function parseOnnx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const model = parseModelProto(new ProtoReader(bytes));

  const interfaceItems = [
    ...model.graph.inputs.map((item) => ({ ...item, direction: 'Input' })),
    ...model.graph.outputs.map((item) => ({ ...item, direction: 'Output' })),
  ];
  const dependencyTrace = buildDependencyTrace(model);

  return {
    kind: 'onnx',
    header: {
      irVersion: model.irVersion,
      opsetCount: model.opsets.length,
      metadataCount: model.metadataProps.length,
      inputCount: model.graph.inputs.length,
      outputCount: model.graph.outputs.length,
      nodeCount: model.graph.nodes.length,
      initializerCount: model.graph.initializerCount,
      fileSize: file.size,
    },
    metadataEntries: buildMetadataEntries(model),
    graph: {
      name: model.graph.name,
      interface: interfaceItems,
      nodes: model.graph.nodes,
      dependencyTrace,
    },
    model,
  };
}
