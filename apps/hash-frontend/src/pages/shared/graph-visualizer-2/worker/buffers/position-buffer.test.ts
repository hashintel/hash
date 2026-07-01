import { describe, expect, it } from "vitest";

import {
  FLAT_COLOR_BYTE_OFFSET,
  FLAT_HEADER_BYTES,
  FLAT_RECORD_BYTES,
  FlatGraphBuffer,
} from "./position-buffer";

const SLOTS = FLAT_RECORD_BYTES / 4;

describe("FlatGraphBuffer", () => {
  it("round-trips position, radius, colour, and entityIdx in one record", () => {
    const buffer = new FlatGraphBuffer(4);
    buffer.setPosition(2, 12.5, -7.25);
    buffer.setRadius(2, 9);
    buffer.setColor(2, [10, 20, 30, 40]);
    buffer.setEntityIdx(2, 12_345);

    const floats = new Float32Array(buffer.raw, FLAT_HEADER_BYTES);
    const bytes = new Uint8Array(buffer.raw, FLAT_HEADER_BYTES);
    const u32 = new Uint32Array(buffer.raw, FLAT_HEADER_BYTES);

    expect(floats[2 * SLOTS]).toBeCloseTo(12.5, 3);
    expect(floats[2 * SLOTS + 1]).toBeCloseTo(-7.25, 3);
    expect(floats[2 * SLOTS + 2]).toBeCloseTo(9, 3);
    const colorBase = 2 * FLAT_RECORD_BYTES + FLAT_COLOR_BYTE_OFFSET;
    expect([
      bytes[colorBase],
      bytes[colorBase + 1],
      bytes[colorBase + 2],
      bytes[colorBase + 3],
    ]).toEqual([10, 20, 30, 40]);
    expect(u32[2 * SLOTS + 4]).toBe(12_345);
  });

  it("is NON-resizable so WebGL can upload its views", () => {
    // The crux of the GPU-upload constraint: a resizable ArrayBuffer's views are rejected
    // by bufferSubData, so the flat buffer must be fixed-size and grow by re-allocation.
    const buffer = new FlatGraphBuffer(4);
    if (buffer.raw instanceof SharedArrayBuffer) {
      expect(buffer.raw.growable).toBe(false);
    } else {
      expect(buffer.raw.resizable).toBe(false);
    }
  });

  it("grows by re-allocating + re-publishing, copying existing records", () => {
    let republished: SharedArrayBuffer | ArrayBuffer | null = null;
    const onRepublish = (raw: SharedArrayBuffer | ArrayBuffer) => {
      republished = raw;
    };
    const buffer = new FlatGraphBuffer(2, onRepublish);
    buffer.setPosition(0, 1, 2);
    buffer.setEntityIdx(0, 7);
    expect(buffer.capacity).toBe(2);

    buffer.ensureCapacity(10); // non-resizable → always re-allocate + re-publish
    expect(buffer.capacity).toBeGreaterThanOrEqual(10);
    expect(republished).toBe(buffer.raw); // the new buffer reached the publisher
    // The re-allocated buffer is itself non-resizable (still GPU-uploadable).
    if (buffer.raw instanceof SharedArrayBuffer) {
      expect(buffer.raw.growable).toBe(false);
    }

    buffer.setPosition(9, 3, 4); // a record only the grown buffer can hold
    const floats = new Float32Array(buffer.raw, FLAT_HEADER_BYTES);
    const u32 = new Uint32Array(buffer.raw, FLAT_HEADER_BYTES);
    expect(floats[9 * SLOTS]).toBeCloseTo(3, 3);
    expect(floats[0 * SLOTS]).toBeCloseTo(1, 3); // record survived the re-allocation copy
    expect(u32[0 * SLOTS + 4]).toBe(7);
  });
});
