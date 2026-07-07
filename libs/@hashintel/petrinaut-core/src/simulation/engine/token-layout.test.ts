import { describe, expect, it } from "vitest";

import {
  computeTokenSlotLayout,
  createTokenRegionViews,
  encodeTokenToBytes,
  encodeTokenValuesToBytes,
  readTokenRecord,
} from "./token-layout";

import type { Color } from "../../types/sdcpn";

type ColorElement = Color["elements"][number];

const element = (name: string, type: ColorElement["type"]): ColorElement => ({
  elementId: name,
  name,
  type,
});

describe("computeTokenSlotLayout", () => {
  it("returns a zero-stride layout for an empty colour", () => {
    const layout = computeTokenSlotLayout([]);

    expect(layout.strideBytes).toBe(0);
    expect(layout.fields).toEqual([]);
    expect(layout.paddingRanges).toEqual([]);
    expect(layout.realFieldF64Offsets).toEqual([]);
  });

  it("orders fields by decreasing alignment, stable within equal alignment", () => {
    const layout = computeTokenSlotLayout([
      element("active", "boolean"),
      element("amount", "real"),
      element("count", "integer"),
      element("done", "boolean"),
    ]);

    expect(
      layout.fields.map((field) => [
        field.element.name,
        field.kind,
        field.byteOffset,
      ]),
    ).toEqual([
      ["amount", "f64", 0],
      ["count", "f64", 8],
      ["active", "u8", 16],
      ["done", "u8", 17],
    ]);
    expect(layout.strideBytes).toBe(24);
    expect(layout.paddingRanges).toEqual([{ start: 18, end: 24 }]);
    expect(layout.realFieldF64Offsets).toEqual([0]);
  });

  it("rounds the stride up to 8 bytes for boolean-only colours", () => {
    const layout = computeTokenSlotLayout([
      element("a", "boolean"),
      element("b", "boolean"),
    ]);

    expect(layout.strideBytes).toBe(8);
    expect(layout.fields.map((field) => field.byteOffset)).toEqual([0, 1]);
    expect(layout.paddingRanges).toEqual([{ start: 2, end: 8 }]);
    expect(layout.realFieldF64Offsets).toEqual([]);
  });

  it("keeps f64-only colours padding-free", () => {
    const layout = computeTokenSlotLayout([
      element("x", "real"),
      element("y", "real"),
      element("n", "integer"),
    ]);

    expect(layout.strideBytes).toBe(24);
    expect(layout.paddingRanges).toEqual([]);
    expect(layout.realFieldF64Offsets).toEqual([0, 1]);
  });
});

describe("encode/decode round trip", () => {
  const elements = [
    element("amount", "real"),
    element("count", "integer"),
    element("active", "boolean"),
  ];
  const layout = computeTokenSlotLayout(elements);

  it("round-trips reals, rounded integers, and boolean u8 values", () => {
    const bytes = encodeTokenToBytes(
      layout,
      { amount: 1.25, count: 2.7, active: true },
      "Test",
    );

    expect(bytes.byteLength).toBe(24);
    // Boolean is stored as one byte at its packed offset.
    expect(bytes[16]).toBe(1);

    const { f64, u8 } = createTokenRegionViews(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );
    expect(readTokenRecord(layout, f64, u8, 0)).toEqual({
      amount: 1.25,
      count: 3,
      active: true,
    });
  });

  it("stores false booleans as 0 and defaults missing values", () => {
    const bytes = encodeTokenToBytes(layout, { amount: -2 }, "Test");
    const { f64, u8 } = createTokenRegionViews(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );

    expect(bytes[16]).toBe(0);
    expect(readTokenRecord(layout, f64, u8, 0)).toEqual({
      amount: -2,
      count: 0,
      active: false,
    });
  });

  it("packs pre-encoded slot values by element name", () => {
    const bytes = encodeTokenValuesToBytes(layout, {
      amount: 0.5,
      count: 4,
      active: 1,
    });
    const { f64, u8 } = createTokenRegionViews(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );

    expect(readTokenRecord(layout, f64, u8, 0)).toEqual({
      amount: 0.5,
      count: 4,
      active: true,
    });
  });

  it("reads tokens at non-zero token byte offsets", () => {
    const region = new Uint8Array(2 * layout.strideBytes);
    region.set(
      encodeTokenToBytes(layout, { amount: 1, count: 1, active: false }, "T"),
      0,
    );
    region.set(
      encodeTokenToBytes(layout, { amount: 2, count: 5, active: true }, "T"),
      layout.strideBytes,
    );

    const { f64, u8 } = createTokenRegionViews(
      region.buffer,
      region.byteOffset,
      region.byteLength,
    );
    expect(readTokenRecord(layout, f64, u8, layout.strideBytes)).toEqual({
      amount: 2,
      count: 5,
      active: true,
    });
  });
});

describe("createTokenRegionViews", () => {
  it("rejects unaligned offsets and lengths", () => {
    const buffer = new ArrayBuffer(32);

    expect(() => createTokenRegionViews(buffer, 4, 8)).toThrow(
      "not 8-byte aligned",
    );
    expect(() => createTokenRegionViews(buffer, 0, 12)).toThrow(
      "not a multiple of 8",
    );
  });
});
