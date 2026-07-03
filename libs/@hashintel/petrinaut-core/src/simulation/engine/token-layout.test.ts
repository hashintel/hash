import { describe, expect, it } from "vitest";

import {
  computeTokenSlotLayout,
  createTokenRegionViews,
  encodeTokenToBytes,
  encodeTokenValuesToBytes,
  readTokenRecord,
} from "./token-layout";
import { formatUuid, parseUuid } from "./uuid";

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

  it("lays out 16-byte u64x2 uuid fields among 8-aligned fields in declaration order", () => {
    const layout = computeTokenSlotLayout([
      element("active", "boolean"),
      element("id", "uuid"),
      element("x", "real"),
      element("owner", "uuid"),
    ]);

    expect(
      layout.fields.map((field) => [
        field.element.name,
        field.kind,
        field.byteOffset,
        field.byteSize,
      ]),
    ).toEqual([
      ["id", "u64x2", 0, 16],
      ["x", "f64", 16, 8],
      ["owner", "u64x2", 24, 16],
      ["active", "u8", 40, 1],
    ]);
    expect(layout.strideBytes).toBe(48);
    expect(layout.paddingRanges).toEqual([{ start: 41, end: 48 }]);
    // Real-field f64 offsets skip uuid lanes.
    expect(layout.realFieldF64Offsets).toEqual([2]);
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

    const views = createTokenRegionViews(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );
    expect(readTokenRecord(layout, views, 0)).toEqual({
      amount: 1.25,
      count: 3,
      active: true,
    });
  });

  it("stores false booleans as 0 and defaults missing values", () => {
    const bytes = encodeTokenToBytes(layout, { amount: -2 }, "Test");
    const views = createTokenRegionViews(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );

    expect(bytes[16]).toBe(0);
    expect(readTokenRecord(layout, views, 0)).toEqual({
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
    const views = createTokenRegionViews(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );

    expect(readTokenRecord(layout, views, 0)).toEqual({
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

    const views = createTokenRegionViews(
      region.buffer,
      region.byteOffset,
      region.byteLength,
    );
    expect(readTokenRecord(layout, views, layout.strideBytes)).toEqual({
      amount: 2,
      count: 5,
      active: true,
    });
  });
});

describe("uuid u64x2 lanes", () => {
  const elements = [
    element("id", "uuid"),
    element("x", "real"),
    element("active", "boolean"),
  ];
  const layout = computeTokenSlotLayout(elements);
  const canonical = "0f9a3b5c-7d1e-4a2b-8c3d-4e5f6a7b8c9d";
  const canonicalValue = parseUuid(canonical);

  it("stores the lo lane at the field offset and the hi lane at +8, little-endian", () => {
    const bytes = encodeTokenToBytes(
      layout,
      { id: canonicalValue, x: 0, active: false },
      "Test",
    );

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // eslint-disable-next-line no-bitwise -- lane inspection
    expect(view.getBigUint64(0, true)).toBe(
      canonicalValue & 0xffffffffffffffffn,
    );
    // eslint-disable-next-line no-bitwise -- lane inspection
    expect(view.getBigUint64(8, true)).toBe(canonicalValue >> 64n);
  });

  it("round-trips bigint and string uuid values", () => {
    for (const idValue of [canonicalValue, canonical]) {
      const bytes = encodeTokenToBytes(
        layout,
        { id: idValue, x: 1.5, active: true },
        "Test",
      );
      const views = createTokenRegionViews(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      expect(readTokenRecord(layout, views, 0)).toEqual({
        id: canonicalValue,
        x: 1.5,
        active: true,
      });
    }
  });

  it("round-trips a NaN-payload uuid without float canonicalization", () => {
    // If either lane went through a Float64Array this payload would be
    // silently rewritten to the canonical NaN bit pattern.
    const nanPayload = parseUuid("ffffffff-ffff-4fff-bfff-ffffffffffff");
    const bytes = encodeTokenValuesToBytes(layout, {
      id: nanPayload,
      x: 2,
      active: 1,
    });
    const views = createTokenRegionViews(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );

    const record = readTokenRecord(layout, views, 0);
    expect(record.id).toBe(nanPayload);
    expect(formatUuid(record.id as bigint)).toBe(
      "ffffffff-ffff-4fff-bfff-ffffffffffff",
    );
  });

  it("defaults missing uuid values to the nil uuid in pre-encoded packing", () => {
    const bytes = encodeTokenValuesToBytes(layout, { x: 1, active: 0 });
    const views = createTokenRegionViews(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );

    expect(readTokenRecord(layout, views, 0)).toEqual({
      id: 0n,
      x: 1,
      active: false,
    });
  });

  it("reads uuid lanes at non-zero token byte offsets", () => {
    const first = parseUuid("11111111-2222-4333-8444-555555555555");
    const second = parseUuid("aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee");
    const region = new Uint8Array(2 * layout.strideBytes);
    region.set(
      encodeTokenToBytes(layout, { id: first, x: 1, active: false }, "T"),
      0,
    );
    region.set(
      encodeTokenToBytes(layout, { id: second, x: 2, active: true }, "T"),
      layout.strideBytes,
    );

    const views = createTokenRegionViews(
      region.buffer,
      region.byteOffset,
      region.byteLength,
    );
    expect(readTokenRecord(layout, views, layout.strideBytes)).toEqual({
      id: second,
      x: 2,
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
