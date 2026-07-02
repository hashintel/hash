/**
 * Growable typed-array columns with optional SharedArrayBuffer backing for
 * worker/main-thread sharing or plain ArrayBuffer for GPU upload paths.
 */
type BackingBuffer = SharedArrayBuffer | ArrayBuffer;

const sharedBufferAvailable = typeof SharedArrayBuffer !== "undefined";

export interface ColumnOptions {
  /**
   * Which buffer to allocate:
   *
   * - `"shared-if-available"` (default): SharedArrayBuffer when the platform
   *   has it, so workers and the main thread can read the same memory.
   * - `"plain"`: always a regular ArrayBuffer. Use this for columns whose
   *   views are handed to GPU upload APIs (deck attributes, luma textures):
   *   WebGL entry points do not reliably accept SharedArrayBuffer-backed views
   *   across browsers. Also use plain when nothing reads the column cross-thread.
   */
  readonly backing?: "shared-if-available" | "plain";
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

  /** The underlying typed array backing this read-only slice. */
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
 * Growable columnar storage using SharedArrayBuffer when available,
 * falling back to ArrayBuffer otherwise.
 *
 * SharedArrayBuffer allows both the worker and main thread to read
 * the same memory without serialization. The column grows by doubling
 * capacity; when resizable shared buffers are available it resizes in place,
 * otherwise it allocates and copies. Columns whose views feed GPU upload
 * APIs must opt out of the shared backing ({@link ColumnOptions.backing}).
 *
 * Generic over typed array kind via the constructor parameter:
 *
 *     const entities = new Column(Uint32Array, 4096);
 *     const positions = new Column(Float32Array, 4096);
 */
export class Column<A extends TypedArray, T extends number = number> {
  readonly #ctor: TypedArrayConstructor<A>;
  readonly #shared: boolean;
  #buffer: BackingBuffer;
  #view: A;
  #length: number;

  constructor(
    Ctor: TypedArrayConstructor<A>,
    initialCapacity: number,
    options?: ColumnOptions,
  ) {
    this.#ctor = Ctor;
    this.#shared =
      sharedBufferAvailable &&
      (options?.backing ?? "shared-if-available") !== "plain";
    this.#buffer = this.#alloc(initialCapacity * Ctor.BYTES_PER_ELEMENT);
    this.#view = new Ctor(this.#buffer);
    this.#length = 0;
  }

  #alloc(byteLength: number): BackingBuffer {
    return this.#shared
      ? new SharedArrayBuffer(byteLength)
      : new ArrayBuffer(byteLength);
  }

  get length(): number {
    return this.#length;
  }

  /** Allocated slots (≥ {@link length}); grows by doubling, never shrinks. */
  get capacity(): number {
    return this.#view.length;
  }

  /** The underlying buffer. SharedArrayBuffer when available. */
  get buffer(): BackingBuffer {
    return this.#buffer;
  }

  push(value: T): number {
    if (this.#length >= this.#view.length) {
      this.#grow(this.#length + 1);
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

  /**
   * The raw backing view over the FULL CAPACITY — zero-allocation access for
   * hot loops that already bound their indices by {@link length}. Unlike
   * {@link subarray}, no view object is created and no bounds are enforced;
   * slots past the filled window are exposed. Prefer {@link subarray}
   * wherever a correctly-sized view matters (GPU uploads, iteration).
   *
   * The reference is invalidated by anything that can grow the column
   * ({@link push}, {@link resize}, {@link append}): re-read it afterwards.
   */
  get raw(): A {
    return this.#view;
  }

  /**
   * Reset the filled length to zero. Capacity (and buffer identity) are
   * kept, so a column reused as per-frame scratch stops allocating once it
   * has seen its high-water mark.
   */
  clear(): void {
    this.#length = 0;
  }

  /**
   * Set the filled length directly (random-access/scatter usage, where the
   * window size is known up front rather than discovered by `push`).
   *
   * Growth preserves contents and is not automatically zeroed; slots re-exposed by growing the window after
   * a `clear`/shrink keep whatever they last held. Callers that need a clean
   * window must {@link fill} it.
   */
  resize(length: number): void {
    this.#ensureCapacity(length);
    this.#length = length;
  }

  /** Fill the filled window (or a sub-range of it) with `value`. */
  fill(value: T, start = 0, end = this.#length): void {
    this.#view.fill(value, start, Math.min(end, this.#length));
  }

  /**
   * Remove the first occurrence of `value` by swapping it with the last
   * element and shrinking by one. O(n) scan, O(1) removal. Returns true
   * if the value was found.
   */
  swapRemove(value: T): boolean {
    for (let i = 0; i < this.#length; i++) {
      if (this.#view[i] === value) {
        this.#length--;
        if (i < this.#length) {
          this.#view[i] = this.#view[this.#length]!;
        }
        return true;
      }
    }
    return false;
  }

  /** Append all elements from one or more columns. */
  append(...columns: Column<A, T>[]): void {
    let total = this.#length;
    for (const column of columns) {
      total += column.#length;
    }

    this.#ensureCapacity(total);
    for (const column of columns) {
      this.#view.set(column.#view.subarray(0, column.#length), this.#length);
      this.#length += column.#length;
    }
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

  #ensureCapacity(needed: number): void {
    if (needed <= this.#view.length) {
      return;
    }
    this.#grow(needed);
  }

  #grow(minCapacity: number): void {
    let newCapacity = Math.max(1, this.#view.length * 2);
    while (newCapacity < minCapacity) {
      newCapacity *= 2;
    }
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
      const next = this.#alloc(newByteLength);
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
