export class Writer {
  private buffer: ArrayBuffer;
  private view: Uint8Array;
  private offset: number;

  constructor() {
    this.buffer = new ArrayBuffer(1024);
    this.view = new Uint8Array(this.buffer);
    this.offset = 0;
  }

  public getBytes(): Uint8Array {
    return this.view.slice(0, this.offset);
  }

  grow(toWrite: number) {
    const expectedLength = this.offset + toWrite;
    if (expectedLength < this.view.length) {
      return;
    }

    let newLength = this.view.length * 2;
    while (newLength < expectedLength) {
      newLength *= 2;
    }

    const newBuffer = new ArrayBuffer(this.buffer.byteLength * 2);
    const newView = new Uint8Array(newBuffer);

    newView.set(this.view);

    this.buffer = newBuffer;
    this.view = newView;
  }

  public writeByte(byte: number): void {
    this.grow(1);
    this.view[this.offset++] = byte;
  }

  public writeBytes(bytes: Uint8Array): void {
    this.grow(bytes.length);
    this.view.set(bytes, this.offset);
    this.offset += bytes.length;
  }

  public writeString(string: string): void {
    const bytes = new TextEncoder().encode(string);
    this.writeBytes(bytes);
  }

  public writeVarUInt(value: number): void {
    // TODO: implement
  }
}
