/**
 * A typed array constructor that can create views over a SharedArrayBuffer.
 *
 * This is the type-level trick that makes Column generic: pass the constructor
 * as a value, and TypeScript infers the element type from it.
 */
type BackingBuffer = SharedArrayBuffer | ArrayBuffer;

const sharedBufferAvailable = typeof SharedArrayBuffer !== "undefined";

function allocBuffer(byteLength: number): BackingBuffer {
  return sharedBufferAvailable
    ? new SharedArrayBuffer(byteLength)
    : new ArrayBuffer(byteLength);
}

export type TypedArrayConstructor<T extends TypedArray> = {
  new (buffer: BackingBuffer, byteOffset?: number, length?: number): T;
  readonly BYTES_PER_ELEMENT: number;
};

export type TypedArray =
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Float32Array
  | Float64Array;

/**
 * Readonly view over a region of a typed array.
 *
 * Preserves the branded element type `T` and provides indexed access,
 * iteration, and further sub-slicing without exposing mutation.
 */
export class ColumnView<A extends TypedArray, T extends number = number> {
  readonly #view: A;

  constructor(view: A) {
    this.#view = view;
  }

  get length(): number {
    return this.#view.length;
  }

  /** The underlying buffer (shared when SharedArrayBuffer is available). */
  get buffer(): BackingBuffer {
    return this.#view.buffer as BackingBuffer;
  }

  /** The raw typed array backing this view. */
  get view(): A {
    return this.#view;
  }

  get(idx: number): T {
    if (idx < 0 || idx >= this.#view.length) {
      throw new RangeError(
        `ColumnView: index ${idx} out of bounds [0, ${this.#view.length})`,
      );
    }

    return this.#view[idx]! as T;
  }

  /** Zero-copy sub-view. Shares the same underlying buffer. */
  subarray(start?: number, end?: number): ColumnView<A, T> {
    return new ColumnView<A, T>(this.#view.subarray(start, end) as A);
  }

  [Symbol.iterator](): ArrayIterator<T> {
    return this.#view[Symbol.iterator]() as ArrayIterator<T>;
  }
}

/**
 * Growable columnar storage backed by SharedArrayBuffer when available,
 * falling back to ArrayBuffer otherwise.
 *
 * SharedArrayBuffer allows both the worker and main thread to read
 * the same memory without serialization. The column grows by doubling
 * capacity; when resizable shared buffers are available it resizes in place,
 * otherwise it allocates and copies.
 *
 * Generic over typed array kind via the constructor parameter:
 *
 *     const entities = new Column(Uint32Array, 4096);
 *     const positions = new Column(Float32Array, 4096);
 */
export class Column<A extends TypedArray, T extends number = number> {
  readonly #ctor: TypedArrayConstructor<A>;
  #buffer: BackingBuffer;
  #view: A;
  #length: number;

  constructor(Ctor: TypedArrayConstructor<A>, initialCapacity: number) {
    this.#ctor = Ctor;
    this.#buffer = allocBuffer(initialCapacity * Ctor.BYTES_PER_ELEMENT);
    this.#view = new Ctor(this.#buffer);
    this.#length = 0;
  }

  get length(): number {
    return this.#length;
  }

  /** The underlying buffer. SharedArrayBuffer when available. */
  get buffer(): BackingBuffer {
    return this.#buffer;
  }

  push(value: T): number {
    if (this.#length >= this.#view.length) {
      this.#grow();
    }

    const idx = this.#length;
    this.#view[idx] = value;
    this.#length++;

    return idx;
  }

  get(idx: number): T {
    if (idx < 0 || idx >= this.#length) {
      throw new RangeError(
        `Column: index ${idx} out of bounds [0, ${this.#length})`,
      );
    }

    return this.#view[idx]! as T;
  }

  getOrDefault(idx: number): T {
    if (idx < 0 || idx >= this.#length) {
      return 0 as T;
    }

    return this.#view[idx]! as T;
  }

  set(idx: number, value: T): void {
    if (idx < 0 || idx >= this.#length) {
      throw new RangeError(
        `Column: index ${idx} out of bounds [0, ${this.#length})`,
      );
    }

    this.#view[idx] = value;
  }

  /** Zero-copy view over the filled portion, or a sub-range of it. */
  subarray(start?: number, end?: number): ColumnView<A, T> {
    const filled = new this.#ctor(this.#buffer, 0, this.#length);

    return new ColumnView<A, T>(filled.subarray(start, end) as A);
  }

  /** Copy the filled portion (or a sub-range) into a new independent Column. */
  slice(start?: number, end?: number): Column<A, T> {
    const source = this.subarray(start, end);
    const col = new Column<A, T>(this.#ctor, source.length);
    for (const value of source) {
      col.push(value);
    }
    return col;
  }

  #grow(): void {
    const newCapacity = Math.max(1, this.#view.length * 2);
    const newByteLength = newCapacity * this.#ctor.BYTES_PER_ELEMENT;

    if (
      sharedBufferAvailable &&
      this.#buffer instanceof SharedArrayBuffer &&
      this.#buffer.growable &&
      this.#buffer.maxByteLength >= newByteLength
    ) {
      this.#buffer.grow(newByteLength);
      this.#view = new this.#ctor(this.#buffer);
    } else {
      const next = allocBuffer(newByteLength);
      const nextView = new this.#ctor(next);
      nextView.set(this.#view);
      this.#buffer = next;
      this.#view = nextView;
    }
  }

  [Symbol.iterator](): ArrayIterator<T> {
    return this.subarray()[Symbol.iterator]();
  }
}
