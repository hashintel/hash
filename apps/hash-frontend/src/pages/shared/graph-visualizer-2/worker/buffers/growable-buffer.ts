/* eslint-disable no-bitwise */
/**
 * Growable SharedArrayBuffer primitives.
 *
 * {@link GrowableBuffer} owns the grow-or-republish dance: grow in place
 * when possible (ES2024 growable SharedArrayBuffer), otherwise re-allocate,
 * copy, re-bind views, and notify the main thread. Subclasses describe
 * their record layout and re-bind views via {@link GrowableBuffer.bindRecordViews}.
 */

/** SharedArrayBuffer is available at all (cross-origin isolation present). */
export const sharedBufferAvailable = typeof SharedArrayBuffer !== "undefined";

/** Whether SharedArrayBuffers can grow in place (ES2024 growable SharedArrayBuffer). */
export const growableSharedBuffer =
  sharedBufferAvailable &&
  typeof SharedArrayBuffer.prototype.grow === "function";

/**
 * Allocate a buffer that can grow in place up to `maxByteLength`. The ceiling
 * reserves address space, not committed memory. Pass `resizable: false` for
 * GPU-uploaded buffers (WebGL rejects views over a resizable ArrayBuffer).
 */
export function makeGrowableBuffer(
  byteLength: number,
  maxByteLength: number,
  resizable = true,
): SharedArrayBuffer | ArrayBuffer {
  if (resizable && growableSharedBuffer) {
    return new SharedArrayBuffer(byteLength, { maxByteLength });
  }
  if (sharedBufferAvailable) {
    return new SharedArrayBuffer(byteLength);
  }
  return new ArrayBuffer(byteLength);
}

/** Grow `raw` in place to at least `byteLength`. Returns false when it can't. */
export function growBuffer(
  raw: SharedArrayBuffer | ArrayBuffer,
  byteLength: number,
): boolean {
  if (byteLength <= raw.byteLength) {
    return true;
  }
  if (!growableSharedBuffer || !(raw instanceof SharedArrayBuffer)) {
    return false;
  }
  if (byteLength > raw.maxByteLength) {
    return false;
  }
  raw.grow(byteLength);
  return true;
}

/** Invoked when a buffer was re-allocated (the main thread must swap to the new buffer). */
export type RepublishHandler = (
  raw: SharedArrayBuffer | ArrayBuffer,
  capacity: number,
) => void;

/** Guard: overflow without a republish handler is a misconfiguration. */
const throwOnUnhandledRepublish: RepublishHandler = () => {
  throw new Error(
    "GrowableBuffer overflowed its maxByteLength but no republish handler was provided, so the re-allocated buffer cannot reach the main thread.",
  );
};

/**
 * SharedArrayBuffer-backed store with a `[version:int32]` header followed by
 * fixed-size records, that grows on demand. Subclasses define their record
 * layout via {@link bindRecordViews}. Pass `resizable: false` for GPU-uploaded
 * buffers that must re-allocate instead of growing in place.
 */
export abstract class GrowableBuffer {
  /** The raw buffer; reassigned (and re-published) when it must be re-allocated. */
  raw: SharedArrayBuffer | ArrayBuffer;
  protected readonly headerBytes: number;
  protected readonly recordBytes: number;
  #version: Int32Array;
  readonly #republish: RepublishHandler;
  readonly #resizable: boolean;

  protected constructor(
    headerBytes: number,
    recordBytes: number,
    capacity: number,
    maxCapacity: number,
    republish: RepublishHandler = throwOnUnhandledRepublish,
    resizable = true,
  ) {
    this.headerBytes = headerBytes;
    this.recordBytes = recordBytes;
    this.#republish = republish;
    this.#resizable = resizable;
    const cap = Math.max(1, capacity);
    const maxCap = Math.max(cap, maxCapacity);
    this.raw = makeGrowableBuffer(
      headerBytes + cap * recordBytes,
      headerBytes + maxCap * recordBytes,
      resizable,
    );
    this.#version = new Int32Array(this.raw, 0, 1);
    // NB: cannot call bindRecordViews() here, subclass fields aren't initialised yet.
    // The subclass constructor calls it once after super().
  }

  /** Records the buffer currently holds (grows as it does). */
  get capacity(): number {
    return (this.raw.byteLength - this.headerBytes) / this.recordBytes;
  }

  /** Ensure room for `needed` records, growing or re-allocating as necessary. */
  ensureCapacity(needed: number): void {
    const neededBytes = this.headerBytes + needed * this.recordBytes;
    if (growBuffer(this.raw, neededBytes)) {
      return;
    }
    // Double current capacity or use the requested amount, whichever is larger.
    const growTo = Math.max(needed, this.capacity * 2);
    const growToBytes = this.headerBytes + growTo * this.recordBytes;
    const next = makeGrowableBuffer(
      growToBytes,
      Math.max(growToBytes, this.raw.byteLength * 2),
      this.#resizable,
    );
    new Uint8Array(next).set(new Uint8Array(this.raw));
    this.raw = next;
    this.#version = new Int32Array(this.raw, 0, 1);
    this.bindRecordViews(this.raw);
    this.#republish(this.raw, growTo);
  }

  /** Bump + notify the version counter so the main thread re-reads the buffer. */
  commit(): void {
    if (sharedBufferAvailable) {
      Atomics.store(this.#version, 0, (this.#version[0]! + 1) | 0);
      Atomics.notify(this.#version, 0);
    } else {
      this.#version[0] = (this.#version[0]! + 1) | 0;
    }
  }

  /**
   * Re-create the record-field views over `raw`. Called by the subclass constructor
   * (once, after super()) and again on every re-publish. Must not be called from
   * {@link GrowableBuffer}'s own constructor: the subclass's fields aren't live yet.
   */
  protected abstract bindRecordViews(
    raw: SharedArrayBuffer | ArrayBuffer,
  ): void;
}
