const VALUE_TYPE_NAMES = {
  0: 'uint8',
  1: 'int8',
  2: 'uint16',
  3: 'int16',
  4: 'uint32',
  5: 'int32',
  6: 'float32',
  7: 'bool',
  8: 'string',
  9: 'array',
  10: 'uint64',
  11: 'int64',
  12: 'float64',
};

const TEXT_DECODER = new TextDecoder('utf-8', { fatal: true });

function formatBigInt(value) {
  return value.toString();
}

function toSafeNumber(value, label) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} is too large for browser parsing: ${value.toString()}`);
  }

  return Number(value);
}

class BinaryReader {
  constructor(buffer) {
    this.buffer = buffer;
    this.view = new DataView(buffer);
    this.offset = 0;
  }

  ensureAvailable(length) {
    if (this.offset + length > this.view.byteLength) {
      throw new Error('Unexpected end of file while reading GGUF data');
    }
  }

  readUint8() {
    this.ensureAvailable(1);
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  readInt8() {
    this.ensureAvailable(1);
    const value = this.view.getInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readUint16() {
    this.ensureAvailable(2);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readInt16() {
    this.ensureAvailable(2);
    const value = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readUint32() {
    this.ensureAvailable(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readInt32() {
    this.ensureAvailable(4);
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readFloat32() {
    this.ensureAvailable(4);
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readUint64() {
    this.ensureAvailable(8);
    const value = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return value;
  }

  readInt64() {
    this.ensureAvailable(8);
    const value = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return value;
  }

  readFloat64() {
    this.ensureAvailable(8);
    const value = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return value;
  }

  readBool() {
    const value = this.readUint8();
    if (value !== 0 && value !== 1) {
      throw new Error(`Invalid boolean value ${value} in GGUF metadata`);
    }

    return value === 1;
  }

  readBytes(length) {
    this.ensureAvailable(length);
    const bytes = new Uint8Array(this.buffer, this.offset, length);
    this.offset += length;
    return bytes;
  }

  readString() {
    const byteLength = toSafeNumber(this.readUint64(), 'String length');
    const bytes = this.readBytes(byteLength);
    return TEXT_DECODER.decode(bytes);
  }
}

function serializeValue(value) {
  if (typeof value === 'bigint') {
    return formatBigInt(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item));
  }

  return value;
}

function readScalarValue(reader, valueType) {
  switch (valueType) {
    case 0:
      return reader.readUint8();
    case 1:
      return reader.readInt8();
    case 2:
      return reader.readUint16();
    case 3:
      return reader.readInt16();
    case 4:
      return reader.readUint32();
    case 5:
      return reader.readInt32();
    case 6:
      return reader.readFloat32();
    case 7:
      return reader.readBool();
    case 8:
      return reader.readString();
    case 10:
      return reader.readUint64();
    case 11:
      return reader.readInt64();
    case 12:
      return reader.readFloat64();
    default:
      throw new Error(`Unsupported GGUF value type: ${valueType}`);
  }
}

function readValue(reader, valueType) {
  if (valueType === 9) {
    const elementType = reader.readUint32();
    const length = toSafeNumber(reader.readUint64(), 'Array length');
    const items = [];

    for (let index = 0; index < length; index += 1) {
      items.push(readValue(reader, elementType));
    }

    return {
      type: 'array',
      elementType,
      elementTypeName: VALUE_TYPE_NAMES[elementType] || `type_${elementType}`,
      value: items,
    };
  }

  return {
    type: VALUE_TYPE_NAMES[valueType] || `type_${valueType}`,
    value: readScalarValue(reader, valueType),
  };
}

function readTensorInfo(reader) {
  const name = reader.readString();
  const dimensionsCount = reader.readUint32();
  const dimensions = [];

  for (let index = 0; index < dimensionsCount; index += 1) {
    dimensions.push(formatBigInt(reader.readUint64()));
  }

  return {
    name,
    dimensions,
    ggmlType: reader.readUint32(),
    offset: formatBigInt(reader.readUint64()),
  };
}

export function parseGguf(arrayBuffer) {
  const reader = new BinaryReader(arrayBuffer);
  const magic = TEXT_DECODER.decode(reader.readBytes(4));

  if (magic !== 'GGUF') {
    throw new Error(`Invalid file signature "${magic}". Expected GGUF.`);
  }

  const version = reader.readUint32();
  if (version < 2 || version > 3) {
    throw new Error(`Unsupported GGUF version ${version}. This viewer supports versions 2 and 3.`);
  }

  const tensorCount = toSafeNumber(reader.readUint64(), 'Tensor count');
  const metadataCount = toSafeNumber(reader.readUint64(), 'Metadata count');

  const metadataEntries = [];
  const metadata = {};

  for (let index = 0; index < metadataCount; index += 1) {
    const key = reader.readString();
    const valueType = reader.readUint32();
    const parsed = readValue(reader, valueType);
    const serialized = serializeValue(parsed.value);

    metadataEntries.push({
      key,
      valueType,
      valueTypeName: VALUE_TYPE_NAMES[valueType] || `type_${valueType}`,
      arrayElementTypeName: parsed.elementTypeName || null,
      value: serialized,
    });

    metadata[key] = serialized;
  }

  const tensors = [];
  for (let index = 0; index < tensorCount; index += 1) {
    tensors.push(readTensorInfo(reader));
  }

  return {
    header: {
      magic,
      version,
      tensorCount,
      metadataCount,
      bytesRead: reader.offset,
      fileSize: arrayBuffer.byteLength,
    },
    metadata,
    metadataEntries,
    tensors,
  };
}
