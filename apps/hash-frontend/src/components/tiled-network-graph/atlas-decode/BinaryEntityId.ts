export class BinaryEntityId {
  #inner: Uint8Array;

  constructor(inner: Uint8Array) {
    if (inner.byteLength !== 32) {
      // todo: error
    }

    this.#inner = inner;
  }
}

export class BinaryEntityIdColumn<T extends ArrayBufferLike> {
  #buffer: DataView<T>;

  constructor(buffer: DataView<T>) {
    this.#buffer = buffer;
  }

  get length(): number {
    return this.#buffer.byteLength / 32;
  }

  // TODO: at needs a result?
  at(index: number): BinaryEntityId {
    const start = index * 32;
    const inner = new Uint8Array(
      this.#buffer.buffer,
      this.#buffer.byteOffset + start,
      32,
    );

    return new BinaryEntityId(inner);
  }

  [Symbol.iterator](): Iterator<BinaryEntityId> {
    let index = 0;

    return {
      next: () => {
        if (index < this.length) {
          return { value: this.at(index++), done: false };
        }

        return { value: undefined, done: true };
      },
    };
  }
}
