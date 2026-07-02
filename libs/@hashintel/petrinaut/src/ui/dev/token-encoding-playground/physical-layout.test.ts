import { describe, expect, it } from "vitest";

import {
  computeTokenLayout,
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

describe("computeTokenLayout", () => {
  it("v1 keeps declaration order with one f64 slot per dimension", () => {
    const layout = computeTokenLayout(DIMENSIONS, "v1");

    expect(layout.strideBytes).toBe(24);
    expect(layout.paddingRanges).toEqual([]);
    expect(
      layout.fields.map((f) => [f.name, f.physical.kind, f.byteOffset]),
    ).toEqual([
      ["active", "f64", 0],
      ["amount", "f64", 8],
      ["count", "f64", 16],
    ]);
  });

  it("v2 orders by decreasing alignment and pads the stride to 8", () => {
    const layout = computeTokenLayout(DIMENSIONS, "v2");

    // amount and count (f64, align 8) first — stable relative order — then
    // the u8 boolean, then 7 bytes of tail padding.
    expect(
      layout.fields.map((f) => [f.name, f.physical.kind, f.byteOffset]),
    ).toEqual([
      ["amount", "f64", 0],
      ["count", "f64", 8],
      ["active", "u8", 16],
    ]);
    expect(layout.strideBytes).toBe(24);
    expect(layout.paddingRanges).toEqual([{ start: 17, end: 24 }]);
  });

  it("returns an empty layout for no dimensions", () => {
    const layout = computeTokenLayout([], "v2");
    expect(layout.strideBytes).toBe(0);
    expect(layout.fields).toEqual([]);
  });
});

describe("encodeToken / decodeToken", () => {
  it.each(["v1", "v2"] as const)(
    "round-trips with product coercion in %s mode",
    (mode) => {
      const layout = computeTokenLayout(DIMENSIONS, mode);
      const { stored, decoded } = encodeToken(layout, {
        active: true,
        amount: 1.25,
        count: 2.7,
      });

      expect(stored).toEqual({ active: true, amount: 1.25, count: 3 });
      expect(decoded).toEqual({ active: true, amount: 1.25, count: 3 });
    },
  );

  it("applies typed defaults for missing values", () => {
    const layout = computeTokenLayout(DIMENSIONS, "v2");
    const { decoded } = encodeToken(layout, {});
    expect(decoded).toEqual({ active: false, amount: 0, count: 0 });
  });

  it("stores booleans as a single byte in v2", () => {
    const layout = computeTokenLayout(
      [{ name: "flag", type: "boolean" }],
      "v2",
    );
    const { buffer } = encodeToken(layout, { flag: true });
    expect(layout.strideBytes).toBe(8);
    expect(new Uint8Array(buffer)[0]).toBe(1);
    expect(decodeToken(layout, buffer)).toEqual({ flag: true });
  });
});

describe("bit inspection", () => {
  it("exposes IEEE-754 bits MSB-first for f64 fields", () => {
    const layout = computeTokenLayout([{ name: "x", type: "real" }], "v1");
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
