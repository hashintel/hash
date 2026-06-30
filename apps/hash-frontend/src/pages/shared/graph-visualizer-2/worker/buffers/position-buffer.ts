/* eslint-disable no-bitwise */
/**
 * SharedArrayBuffer-backed position storage shared by every layout engine
 * (d3-force entity layouts and the WebCola cluster layout).
 *
 * Layout: [version: int32 (4 bytes)] [x0, y0, x1, y1, ... : float32]
 *
 * The worker fills {@link PositionBuffer.positions} and calls
 * {@link PositionBuffer.commit}; the version counter (bumped atomically and
 * notified) lets the main thread detect changes via Atomics.waitAsync and read
 * the same memory with zero copying. When SharedArrayBuffer is unavailable we
 * fall back to a plain ArrayBuffer whose contents are messaged across.
 *
 * The growable SharedArrayBuffer primitives ({@link makeGrowableBuffer}, grow-or-republish) live in
 * growable-buffer.ts; {@link FlatGraphBuffer} subclasses {@link GrowableBuffer} for them.
 */

import {
  GrowableBuffer,
  type RepublishHandler,
  sharedBufferAvailable,
} from "./growable-buffer";

export class PositionBuffer {
  /** The raw buffer backing positions. SharedArrayBuffer when available. */
  readonly raw: SharedArrayBuffer | ArrayBuffer;
  /** Interleaved [x0, y0, x1, y1, ...]; fill directly, then {@link commit}. */
  readonly positions: Float32Array;
  readonly #version: Int32Array;

  constructor(nodeCount: number) {
    const byteLength = 4 + nodeCount * 2 * 4;
    this.raw = sharedBufferAvailable
      ? new SharedArrayBuffer(byteLength)
      : new ArrayBuffer(byteLength);
    this.#version = new Int32Array(this.raw, 0, 1);
    this.positions = new Float32Array(this.raw, 4);
  }

  /**
   * Publish the current {@link positions}: bump the version counter so the main
   * thread sees the change. Atomics.store makes the write visible and
   * Atomics.notify wakes any Atomics.waitAsync watcher.
   */
  commit(): void {
    if (sharedBufferAvailable) {
      Atomics.store(this.#version, 0, (this.#version[0]! + 1) | 0);
      Atomics.notify(this.#version, 0);
    } else {
      this.#version[0] = (this.#version[0]! + 1) | 0;
    }
  }
}

/**
 * Per-leaf entity-dot buffer: a 4-byte version header, then one INTERLEAVED record per node:
 *
 *   [version:i32]  then  count records of  { x:f32, y:f32, rgba:u8 x4 }   (12 bytes each)
 *
 * Positions stream from the force layout each tick ({@link setPosition}); the worker writes the
 * per-node colour once it knows it ({@link setColor}), so a selection focus-dim can mutate one
 * node's colour in place without a rebuild. The renderer reads BOTH straight off the buffer as
 * Deck binary attributes -- see {@link leafPositionAttribute} / {@link leafColorAttribute}.
 *
 * Distinct from the positions-only {@link PositionBuffer} (still used by the macro cluster
 * layout, which carries no colour) and from {@link FlatGraphBuffer} (one whole-graph,
 * growable, with radius + entityIdx too). A leaf's node set is fixed for the layout's life
 * (it is recreated wholesale on a count change), so this buffer is non-growable.
 */
export const LEAF_HEADER_BYTES = 4;
export const LEAF_RECORD_BYTES = 12;
/** Byte offset of the rgba colour within a record. */
export const LEAF_COLOR_BYTE_OFFSET = 8;
/** Slots per record (4-byte aligned, so the float and byte views share the stride). */
const LEAF_RECORD_SLOTS = LEAF_RECORD_BYTES / 4;

export class EntityPositionBuffer {
  readonly raw: SharedArrayBuffer | ArrayBuffer;
  readonly #version: Int32Array;
  /** Record fields as floats: record `i` -> [i*S]=x, [i*S+1]=y (S = LEAF_RECORD_SLOTS). */
  readonly #floats: Float32Array;
  /** Record fields as bytes: record `i` colour at [i*LEAF_RECORD_BYTES + LEAF_COLOR_BYTE_OFFSET ..]. */
  readonly #bytes: Uint8Array;

  constructor(nodeCount: number) {
    const byteLength = LEAF_HEADER_BYTES + nodeCount * LEAF_RECORD_BYTES;
    this.raw = sharedBufferAvailable
      ? new SharedArrayBuffer(byteLength)
      : new ArrayBuffer(byteLength);
    this.#version = new Int32Array(this.raw, 0, 1);
    this.#floats = new Float32Array(this.raw, LEAF_HEADER_BYTES);
    this.#bytes = new Uint8Array(this.raw, LEAF_HEADER_BYTES);
  }

  setPosition(index: number, x: number, y: number): void {
    const base = index * LEAF_RECORD_SLOTS;
    this.#floats[base] = x;
    this.#floats[base + 1] = y;
  }

  setColor(
    index: number,
    color: readonly [number, number, number, number],
  ): void {
    const offset = index * LEAF_RECORD_BYTES + LEAF_COLOR_BYTE_OFFSET;
    this.#bytes[offset] = color[0];
    this.#bytes[offset + 1] = color[1];
    this.#bytes[offset + 2] = color[2];
    this.#bytes[offset + 3] = color[3];
  }

  commit(): void {
    if (sharedBufferAvailable) {
      Atomics.store(this.#version, 0, (this.#version[0]! + 1) | 0);
      Atomics.notify(this.#version, 0);
    } else {
      this.#version[0] = (this.#version[0]! + 1) | 0;
    }
  }
}

/** Local x of leaf node `index`, from a records-region view (`new Float32Array(raw, 4)`). */
export function leafNodeX(records: Float32Array, index: number): number {
  return records[index * LEAF_RECORD_SLOTS] ?? 0;
}
/** Local y of leaf node `index`, from a records-region view (`new Float32Array(raw, 4)`). */
export function leafNodeY(records: Float32Array, index: number): number {
  return records[index * LEAF_RECORD_SLOTS + 1] ?? 0;
}

/** Deck binary `getPosition` attribute over a leaf buffer's raw bytes (interleaved, stride-3). */
export function leafPositionAttribute(raw: SharedArrayBuffer | ArrayBuffer): {
  readonly value: Float32Array;
  readonly size: 2;
  readonly stride: number;
  readonly offset: number;
} {
  return {
    value: new Float32Array(raw),
    size: 2,
    stride: LEAF_RECORD_BYTES,
    offset: LEAF_HEADER_BYTES,
  };
}

/** Deck binary `getFillColor` attribute over a leaf buffer's raw bytes (normalized rgba). */
export function leafColorAttribute(raw: SharedArrayBuffer | ArrayBuffer): {
  readonly value: Uint8Array;
  readonly size: 4;
  readonly stride: number;
  readonly offset: number;
  readonly normalized: true;
} {
  return {
    value: new Uint8Array(raw),
    size: 4,
    stride: LEAF_RECORD_BYTES,
    offset: LEAF_HEADER_BYTES + LEAF_COLOR_BYTE_OFFSET,
    normalized: true,
  };
}

/**
 * Interleaved layout of the flat-tier shared buffer. All per-node GPU data lives in one
 * buffer as a header plus fixed-size records:
 *
 *   [version:i32][count:u32]  then  count records of
 *   { x:f32, y:f32, radius:f32, rgba:u8 x4, entityIdx:u32 }   (20 bytes each)
 *
 * `entityIdx` is the join key: it maps a rendered record back to its entity (the
 * main thread pairs it with the EntityIdx->EntityId map buffer, see entity-id-buffer.ts).
 *
 * Interleaving (one record per node) is what makes the buffer growable: appending
 * a node is "write one record at index `count`, bump `count`, one atomic sync",
 * no region shuffling. The renderer reads each field straight off this buffer via
 * stride/offset (the constants below), so there is never a gather or a copy.
 * (`version` must be the Int32Array view, Atomics.notify only accepts that.)
 */
export const FLAT_HEADER_BYTES = 8;
export const FLAT_RECORD_BYTES = 20;
/** Byte offsets of `radius` / `rgba` / `entityIdx` within a record. */
export const FLAT_RADIUS_BYTE_OFFSET = 8;
export const FLAT_COLOR_BYTE_OFFSET = 12;
export const FLAT_ENTITYIDX_BYTE_OFFSET = 16;
/** Slots per record (4-byte aligned, so the float and u32 views share the stride). */
const FLAT_RECORD_SLOTS = FLAT_RECORD_BYTES / 4;

/**
 * SharedArrayBuffer-backed, interleaved store for the flat-tier graph. The layout writes
 * positions each tick; the worker writes radius/colour/count on commit. Per-node
 * updates (a settling position, a degree-driven radius, an interaction highlight)
 * are written in place, never via a structure-frame round-trip.
 *
 * This buffer is uploaded to the GPU each frame (the renderer reads its records as
 * Deck.gl binary attributes), and WebGL rejects views over a resizable ArrayBuffer, so
 * it is non-resizable (`resizable: false`). `capacity` may exceed the live `count` so
 * streamed nodes append into spare records in place; outgrowing it goes through
 * {@link GrowableBuffer.ensureCapacity}'s re-allocate + re-publish path (a fresh, still
 * fixed, uploadable buffer), not an in-place `.grow`.
 */
export class FlatGraphBuffer extends GrowableBuffer {
  /** `count` header slot. */
  #count!: Uint32Array;
  /** Record fields as floats: record `i` -> [i*S]=x, [i*S+1]=y, [i*S+2]=radius
   * (S = FLAT_RECORD_SLOTS). */
  #floats!: Float32Array;
  /** Record fields as bytes: record `i` colour at [i*FLAT_RECORD_BYTES + 12 .. +15]. */
  #bytes!: Uint8Array;
  /** Record fields as u32: record `i` entityIdx at [i*S + 4]. */
  #u32!: Uint32Array;

  constructor(capacity: number, republish?: RepublishHandler) {
    // resizable: false, this buffer's bytes are uploaded to the GPU.
    super(
      FLAT_HEADER_BYTES,
      FLAT_RECORD_BYTES,
      capacity,
      capacity,
      republish,
      false,
    );
    this.bindRecordViews(this.raw);
  }

  /**
   * Re-point the field views at `raw`. Re-runs on every re-allocation (this buffer never
   * grows in place, it is non-resizable for GPU upload). `#count` keeps its explicit
   * length 1 (it is a single header slot).
   */
  protected override bindRecordViews(
    raw: SharedArrayBuffer | ArrayBuffer,
  ): void {
    this.#count = new Uint32Array(raw, 4, 1);
    this.#floats = new Float32Array(raw, FLAT_HEADER_BYTES);
    this.#bytes = new Uint8Array(raw, FLAT_HEADER_BYTES);
    this.#u32 = new Uint32Array(raw, FLAT_HEADER_BYTES);
  }

  get count(): number {
    return this.#count[0]!;
  }

  setCount(value: number): void {
    this.#count[0] = value;
  }

  setPosition(index: number, x: number, y: number): void {
    const base = index * FLAT_RECORD_SLOTS;
    this.#floats[base] = x;
    this.#floats[base + 1] = y;
  }

  setRadius(index: number, radius: number): void {
    this.#floats[index * FLAT_RECORD_SLOTS + 2] = radius;
  }

  /** The join key: which entity this record is (paired with the EntityId map SAB). */
  setEntityIdx(index: number, entityIdx: number): void {
    this.#u32[index * FLAT_RECORD_SLOTS + 4] = entityIdx;
  }

  setColor(
    index: number,
    color: readonly [number, number, number, number],
  ): void {
    const offset = index * FLAT_RECORD_BYTES + FLAT_COLOR_BYTE_OFFSET;
    this.#bytes[offset] = color[0];
    this.#bytes[offset + 1] = color[1];
    this.#bytes[offset + 2] = color[2];
    this.#bytes[offset + 3] = color[3];
  }
}
