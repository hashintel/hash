import { describe, expect, it } from "vitest";

import { parseUuid } from "@hashintel/petrinaut-core";

import {
  computePlaygroundTokenLayout,
  decodeToken,
  encodeToken,
  getFieldBits,
  getFieldHex,
} from "./physical-layout";

import type { PlaygroundDimension } from "./physical-layout";

const DIMENSIONS: PlaygroundDimension[] = [
  { name: "active", type: "boolean" },
  { name: "amount", type: "real" },
  { name: "count", type: "integer" },
];

describe("computePlaygroundTokenLayout", () => {
  it("orders by decreasing alignment and pads the stride to 8", () => {
    const layout = computePlaygroundTokenLayout(DIMENSIONS);

    // amount and count (f64, align 8) first — stable relative order — then
    // the u8 boolean, then 7 bytes of tail padding.
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
    ]);
    expect(layout.strideBytes).toBe(24);
    expect(layout.paddingRanges).toEqual([{ start: 17, end: 24 }]);
  });

  it("returns an empty layout for no dimensions", () => {
    const layout = computePlaygroundTokenLayout([]);
    expect(layout.strideBytes).toBe(0);
    expect(layout.fields).toEqual([]);
  });
});

describe("encodeToken / decodeToken", () => {
  it("round-trips with product coercion", () => {
    const layout = computePlaygroundTokenLayout(DIMENSIONS);
    const { stored, decoded } = encodeToken(layout, {
      active: true,
      amount: 1.25,
      count: 2.7,
    });

    expect(stored).toEqual({ active: true, amount: 1.25, count: 3 });
    expect(decoded).toEqual({ active: true, amount: 1.25, count: 3 });
  });

  it("applies typed defaults for missing values", () => {
    const layout = computePlaygroundTokenLayout(DIMENSIONS);
    const { decoded } = encodeToken(layout, {});
    expect(decoded).toEqual({ active: false, amount: 0, count: 0 });
  });

  it("stores booleans as a single byte", () => {
    const layout = computePlaygroundTokenLayout([
      { name: "flag", type: "boolean" },
    ]);
    const { buffer } = encodeToken(layout, { flag: true });
    expect(layout.strideBytes).toBe(8);
    expect(new Uint8Array(buffer)[0]).toBe(1);
    expect(decodeToken(layout, buffer)).toEqual({ flag: true });
  });
});

describe("bit inspection", () => {
  it("exposes IEEE-754 bits MSB-first for f64 fields", () => {
    const layout = computePlaygroundTokenLayout([{ name: "x", type: "real" }]);
    const { buffer } = encodeToken(layout, { x: -2 });
    const bits = getFieldBits(buffer, layout.fields[0]!);

    // -2 = sign 1, exponent 0x400 (10000000000), mantissa all zero.
    expect(bits).toHaveLength(64);
    expect(bits[0]).toBe(1);
    expect(bits.slice(1, 12).join("")).toBe("10000000000");
    expect(bits.slice(12).every((bit) => bit === 0)).toBe(true);
    expect(getFieldHex(buffer, layout.fields[0]!)).toBe("0xc000000000000000");
  });
});

describe("uuid (u64x2) fields", () => {
  const CANONICAL = "0f9a3b5c-7d1e-4a2b-8c3d-4e5f6a7b8c9d";

  it("lays out 16-byte uuid fields and round-trips bigints", () => {
    const layout = computePlaygroundTokenLayout([
      { name: "id", type: "uuid" },
      { name: "x", type: "real" },
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
    ]);
    expect(layout.strideBytes).toBe(24);

    const { stored, decoded } = encodeToken(layout, {
      id: CANONICAL,
      x: 1.5,
    });
    expect(stored).toEqual({ id: parseUuid(CANONICAL), x: 1.5 });
    expect(decoded).toEqual({ id: parseUuid(CANONICAL), x: 1.5 });
  });

  it("exposes 128 logical bits MSB-first (hi lane's MSB first) and full hex", () => {
    const layout = computePlaygroundTokenLayout([{ name: "id", type: "uuid" }]);
    const { buffer } = encodeToken(layout, { id: CANONICAL });
    const field = layout.fields[0]!;

    const bits = getFieldBits(buffer, field);
    expect(bits).toHaveLength(128);
    // MSB of the value is the top bit of the hi lane: 0x0f… starts 00001111.
    expect(bits.slice(0, 8).join("")).toBe("00001111");
    expect(getFieldHex(buffer, field)).toBe(
      `0x${CANONICAL.replaceAll("-", "")}`,
    );
    // Memory layout: lo lane little-endian at offset 0, hi lane at +8.
    const bytes = new Uint8Array(buffer, field.byteOffset, 16);
    expect(bytes[0]).toBe(0x9d); // lo lane LSB
    expect(bytes[15]).toBe(0x0f); // hi lane MSB
  });
});

describe("string (u64 pool reference) fields", () => {
  it("lays out 8-byte string slots and round-trips through a throwaway pool", () => {
    const layout = computePlaygroundTokenLayout([
      { name: "label", type: "string" },
      { name: "x", type: "real" },
    ]);

    expect(
      layout.fields.map((field) => [
        field.element.name,
        field.kind,
        field.byteOffset,
        field.byteSize,
      ]),
    ).toEqual([
      ["label", "u64", 0, 8],
      ["x", "f64", 8, 8],
    ]);
    expect(layout.strideBytes).toBe(16);

    const { buffer, stored, decoded } = encodeToken(layout, {
      label: "alpha",
      x: 1.5,
    });
    expect(stored).toEqual({ label: "alpha", x: 1.5 });
    expect(decoded).toEqual({ label: "alpha", x: 1.5 });
    // The buffer holds the pool id (1 — id 0 is the pre-seeded ""), not text.
    expect(new DataView(buffer).getBigUint64(0, true)).toBe(1n);
    expect(getFieldHex(buffer, layout.fields[0]!)).toBe("0x0000000000000001");
  });

  it('defaults missing string values to "" (pool id 0)', () => {
    const layout = computePlaygroundTokenLayout([
      { name: "label", type: "string" },
    ]);
    const { buffer, decoded } = encodeToken(layout, {});

    expect(decoded).toEqual({ label: "" });
    expect(new DataView(buffer).getBigUint64(0, true)).toBe(0n);
  });
});
