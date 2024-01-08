const DROP_MSB = 0b0111_1111;
const MSB = 0b1000_0000;
const MAX_SAFE_SHIFT = 4 * 7;

class Checkpoint {
  protected offset: number;

  constructor(offset: number) {
    this.offset = offset;
  }

  public getOffset(): number {
    return this.offset;
  }
}

export class Reader {
  private offset: number;

  constructor(private slice: Uint8Array) {
    this.offset = 0;
  }

  public readByte(): number | null {
    if (this.offset >= this.slice.length) {
      return null;
    }

    return this.slice[this.offset++]!;
  }

  public peakByte(): number | null {
    return this.slice[this.offset] ?? null;
  }

  public readBytes(length: number): Uint8Array | null {
    if (this.offset + length > this.slice.length) {
      return null;
    }

    const bytes = this.slice.slice(this.offset, this.offset + length);
    this.offset += length;
    return bytes;
  }

  public readString(length: number): string | null {
    const bytes = this.readBytes(length);
    if (bytes === null) {
      return null;
    }

    return new TextDecoder().decode(bytes);
  }

  public readUInt8(): number | null {
    const bytes = this.readBytes(1);
    if (bytes === null) {
      return null;
    }

    return new DataView(bytes.buffer).getUint8(0);
  }

  public readInt8(): number | null {
    const bytes = this.readBytes(1);
    if (bytes === null) {
      return null;
    }

    return new DataView(bytes.buffer).getInt8(0);
  }

  public readUInt32(): number | null {
    const bytes = this.readBytes(4);
    if (bytes === null) {
      return null;
    }

    return new DataView(bytes.buffer).getUint32(0, true);
  }

  public readInt32(): number | null {
    const bytes = this.readBytes(4);
    if (bytes === null) {
      return null;
    }

    return new DataView(bytes.buffer).getInt32(0, true);
  }

  public readVarUInt32(): number | null {
    let value = 0;
    let shift = 0;
    const checkpoint = this.saveCheckpoint();

    while (true) {
      const byte = this.readByte();
      if (byte === null) {
        this.restoreCheckpoint(checkpoint);
        return null;
      }

      let byteValue = byte & DROP_MSB;
      value |= byteValue << shift;
      shift += 7;

      if (shift > MAX_SAFE_SHIFT) {
        this.restoreCheckpoint(checkpoint);
        return null;
      }

      if ((byte & MSB) === 0) {
        break;
      }
    }

    return value;
  }

  public readVarInt32(): number | null {
    const value = this.readVarUInt32();
    if (value === null) {
      return null;
    }

    return (value >> 1) ^ -(value & 1);
  }

  public saveCheckpoint(): Checkpoint {
    return new Checkpoint(this.offset);
  }

  public restoreCheckpoint(checkpoint: Checkpoint): void {
    this.offset = checkpoint.getOffset();
  }
}
