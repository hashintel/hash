/* eslint-disable no-bitwise */
/**
 * Growable SharedArrayBuffer primitives + the {@link GrowableBuffer} base shared by
 * every SharedArrayBuffer-backed store that streams and grows ({@link FlatGraphBuffer} in
 * position-buffer.ts, the EntityId map in entity-id-buffer.ts).
 *
 * What those stores have in common is not their record layout, it's the grow-or-
 * republish dance: try to extend the buffer in place (ES2024 growable SharedArrayBuffer)
 * and, when that's impossible (growable shared buffers unsupported, or the `maxByteLength`
 * ceiling hit), re-allocate a larger buffer, copy the bytes across, re-bind the
 * typed-array views, and tell the main thread to swap to the new buffer. Hand-rolling that
 * per store is how the subtle bits (which views are length-tracking, when a copy is
 * needed, when a message must fire) drift apart. {@link GrowableBuffer} owns it exactly
 * once; a subclass only describes its record layout and re-binds its own views.
 */

/** SharedArrayBuffer is available at all (cross-origin isolation present). */
export const sharedBufferAvailable = typeof SharedArrayBuffer !== "undefined";

/**
 * Whether SharedArrayBuffers can grow in place (ES2024 growable SharedArrayBuffer). Where
 * present, a buffer grows with no re-publish up to its `maxByteLength` and the main thread
 * just re-reads the same (now-larger) buffer. Where absent, {@link growBuffer} declines, so
 * {@link GrowableBuffer} re-allocates a bigger buffer and re-publishes it, the universal
 * fallback.
 */
export const growableSharedBuffer =
  sharedBufferAvailable &&
  typeof SharedArrayBuffer.prototype.grow === "function";

/**
 * Allocate a buffer that can grow in place up to `maxByteLength` (a growable
 * SharedArrayBuffer where supported, a plain SharedArrayBuffer where SABs exist but can't
 * grow, else an ArrayBuffer). The ceiling reserves address space, not committed memory.
 *
 * Pass `resizable: false` for buffers whose bytes are uploaded to the GPU: WebGL's
 * `bufferData`/`bufferSubData` reject views over a resizable ArrayBuffer, so those must be
 * fixed-size and grow by re-allocation instead (see {@link GrowableBuffer}).
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

/**
 * Grow `raw` in place to at least `byteLength`; returns false when it can't (growable
 * shared buffers unsupported, or `byteLength` exceeds `maxByteLength`) so the caller
 * re-allocates a fresh, larger buffer and re-publishes it.
 */
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

/**
 * Invoked when a {@link GrowableBuffer} had to be re-allocated rather than grown in place.
 * The main thread must swap to `raw` (now holding `capacity` records) and re-attach its
 * version watcher, so the worker wires this to post a dedicated re-publish message.
 * (In-place growth fires nothing: the main thread already holds the same, now-larger
 * buffer, and its length-tracking views auto-extend.)
 */
export type RepublishHandler = (
  raw: SharedArrayBuffer | ArrayBuffer,
  capacity: number,
) => void;

/** Loud guard for the misconfiguration where a buffer overflows its ceiling but no
 * handler was wired to re-publish the re-allocated buffer, far better than silently
 * leaving the main thread reading a stale, detached buffer. */
const throwOnUnhandledRepublish: RepublishHandler = () => {
  throw new Error(
    "GrowableBuffer overflowed its maxByteLength but no republish handler was provided, so the re-allocated buffer cannot reach the main thread.",
  );
};

/**
 * SharedArrayBuffer-backed store with a `[version:int32]` header followed by fixed-size
 * records, that grows on demand. Subclasses fix the header/record byte sizes and re-bind
 * their own field views in {@link GrowableBuffer.bindRecordViews}; everything about
 * growing, re-publishing, and the atomic version handshake lives here.
 *
 * `resizable: false` makes every allocation a fixed SharedArrayBuffer, required for buffers
 * uploaded to the GPU (WebGL rejects views over resizable ArrayBuffers). Such a buffer
 * can't `.grow` in place, so {@link ensureCapacity} always takes the re-allocate +
 * re-publish path; the main thread swaps to the new (still fixed, uploadable) buffer.
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

  /**
   * Ensure room for `capacity` records. A `resizable` buffer grows in place with no
   * message where possible (length-tracking views auto-extend). Otherwise (a non-
   * resizable (GPU) buffer, or one past its ceiling) it re-allocates a larger buffer,
   * copies the bytes across, re-binds the views, and re-publishes so the main thread
   * swaps to (and re-watches) the new buffer.
   */
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
