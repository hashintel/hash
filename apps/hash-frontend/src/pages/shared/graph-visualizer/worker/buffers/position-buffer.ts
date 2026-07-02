/* eslint-disable no-bitwise */
/**
 * SharedArrayBuffer-backed position storage.
 *
 * Layout: `[version: int32] [x0, y0, x1, y1, ... : float32]`
 *
 * The worker fills positions and calls {@link PositionBuffer.commit}; the
 * version counter (atomic + notify) lets the main thread detect changes
 * via `Atomics.waitAsync` with zero copying.
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
 * Per-leaf entity-dot buffer: interleaved records of `{ x:f32, y:f32, rgba:u8x4 }`
 * (12 bytes each) after a 4-byte version header. Non-growable; recreated on
 * count change.
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
 * Flat-tier interleaved shared buffer. Header plus fixed-size records:
 *
 * `[version:i32][count:u32]` then count records of
 * `{ x:f32, y:f32, radius:f32, rgba:u8x4, entityIdx:u32 }` (20 bytes each)
 *
 * `entityIdx` is the join key mapping a rendered record back to its entity.
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
 * Growable, interleaved store for the flat-tier graph. Non-resizable
 * (GPU-uploaded); outgrowing capacity re-allocates via
 * {@link GrowableBuffer.ensureCapacity}.
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

  /** Re-point field views at the (re-allocated) buffer. */
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
