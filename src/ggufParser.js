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
const CHUNK_SIZE = 4 * 1024 * 1024;

function formatBigInt(value) {
  return value.toString();
}

function toSafeNumber(value, label) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} is too large for browser parsing: ${value.toString()}`);
  }

  return Number(value);
}

class BlobBinaryReader {
  constructor(blob) {
    this.blob = blob;
    this.buffer = new Uint8Array(0);
    this.offset = 0;
    this.loadedEnd = 0;
    this.absoluteOffset = 0;
    this.view = new DataView(new ArrayBuffer(0));
  }

  get bytesRead() {
    return this.absoluteOffset + this.offset;
  }

  compactBuffer() {
    if (this.offset === 0) {
      return;
    }

    this.buffer = this.buffer.slice(this.offset);
    this.absoluteOffset += this.offset;
    this.offset = 0;
    this.view = new DataView(
      this.buffer.buffer,
      this.buffer.byteOffset,
      this.buffer.byteLength
    );
  }

  async appendChunk() {
    if (this.loadedEnd >= this.blob.size) {
      return false;
    }

    if (this.offset > 0 && (this.offset > 1024 * 1024 || this.offset > this.buffer.length / 2)) {
      this.compactBuffer();
    }

    const chunkEnd = Math.min(this.loadedEnd + CHUNK_SIZE, this.blob.size);
    const chunkBuffer = await this.blob.slice(this.loadedEnd, chunkEnd).arrayBuffer();
    const chunk = new Uint8Array(chunkBuffer);
    const merged = new Uint8Array(this.buffer.length + chunk.length);

    merged.set(this.buffer);
    merged.set(chunk, this.buffer.length);

    this.buffer = merged;
    this.loadedEnd = chunkEnd;
    this.view = new DataView(
      this.buffer.buffer,
      this.buffer.byteOffset,
      this.buffer.byteLength
    );

    return true;
  }

  async ensureAvailable(length) {
    while (this.offset + length > this.buffer.length) {
      const appended = await this.appendChunk();
      if (!appended) {
        throw new Error('Unexpected end of file while reading GGUF data');
      }
    }
  }

  async readUint8() {
    await this.ensureAvailable(1);
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  async readInt8() {
    await this.ensureAvailable(1);
    const value = this.view.getInt8(this.offset);
    this.offset += 1;
    return value;
  }

  async readUint16() {
    await this.ensureAvailable(2);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  async readInt16() {
    await this.ensureAvailable(2);
    const value = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  async readUint32() {
    await this.ensureAvailable(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  async readInt32() {
    await this.ensureAvailable(4);
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  async readFloat32() {
    await this.ensureAvailable(4);
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  async readUint64() {
    await this.ensureAvailable(8);
    const value = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return value;
  }

  async readInt64() {
    await this.ensureAvailable(8);
    const value = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return value;
  }

  async readFloat64() {
    await this.ensureAvailable(8);
    const value = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return value;
  }

  async readBool() {
    const value = await this.readUint8();
    if (value !== 0 && value !== 1) {
      throw new Error(`Invalid boolean value ${value} in GGUF metadata`);
    }

    return value === 1;
  }

  async readBytes(length) {
    await this.ensureAvailable(length);
    const bytes = this.buffer.slice(this.offset, this.offset + length);
    this.offset += length;
    return bytes;
  }

  async readString() {
    const byteLength = toSafeNumber(await this.readUint64(), 'String length');
    const bytes = await this.readBytes(byteLength);
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

async function readScalarValue(reader, valueType) {
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

async function readValue(reader, valueType) {
  if (valueType === 9) {
    const elementType = await reader.readUint32();
    const length = toSafeNumber(await reader.readUint64(), 'Array length');
    const items = [];

    for (let index = 0; index < length; index += 1) {
      items.push(await readValue(reader, elementType));
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
    value: await readScalarValue(reader, valueType),
  };
}

async function readTensorInfo(reader) {
  const name = await reader.readString();
  const dimensionsCount = await reader.readUint32();
  const dimensions = [];

  for (let index = 0; index < dimensionsCount; index += 1) {
    dimensions.push(formatBigInt(await reader.readUint64()));
  }

  return {
    name,
    dimensions,
    ggmlType: await reader.readUint32(),
    offset: formatBigInt(await reader.readUint64()),
  };
}

export async function parseGguf(blob) {
  const reader = new BlobBinaryReader(blob);
  const magic = TEXT_DECODER.decode(await reader.readBytes(4));

  if (magic !== 'GGUF') {
    throw new Error(`Invalid file signature "${magic}". Expected GGUF.`);
  }

  const version = await reader.readUint32();
  if (version < 2 || version > 3) {
    throw new Error(`Unsupported GGUF version ${version}. This viewer supports versions 2 and 3.`);
  }

  const tensorCount = toSafeNumber(await reader.readUint64(), 'Tensor count');
  const metadataCount = toSafeNumber(await reader.readUint64(), 'Metadata count');

  const metadataEntries = [];
  const metadata = {};

  for (let index = 0; index < metadataCount; index += 1) {
    const key = await reader.readString();
    const valueType = await reader.readUint32();
    const parsed = await readValue(reader, valueType);
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
    tensors.push(await readTensorInfo(reader));
  }

  return {
    header: {
      magic,
      version,
      tensorCount,
      metadataCount,
      bytesRead: reader.bytesRead,
      fileSize: blob.size,
    },
    metadata,
    metadataEntries,
    tensors,
  };
}
