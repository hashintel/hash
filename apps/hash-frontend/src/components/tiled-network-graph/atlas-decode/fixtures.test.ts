import { describe, expect, it } from "vitest";

import { cborUint } from "./fixtures";

describe("cborUint", () => {
  it.each([
    [0n, [0x00]],
    [23n, [0x17]],
    [24n, [0x18, 0x18]],
    [255n, [0x18, 0xff]],
    [256n, [0x19, 0x01, 0x00]],
    [65_535n, [0x19, 0xff, 0xff]],
    [65_536n, [0x1a, 0x00, 0x01, 0x00, 0x00]],
    [0xffff_ffffn, [0x1a, 0xff, 0xff, 0xff, 0xff]],
    [0x1_0000_0000n, [0x1b, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]],
    [
      0xffff_ffff_ffff_ffffn,
      [0x1b, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
    ],
  ] as const)("canonical_width_%s", (value, bytes) => {
    expect(cborUint(value)).toEqual(bytes);
    if (value <= BigInt(Number.MAX_SAFE_INTEGER)) {
      expect(cborUint(Number(value))).toEqual(bytes);
    }
  });

  it("major_type", () => {
    expect(cborUint(65_536n, 1)).toEqual([0x3a, 0x00, 0x01, 0x00, 0x00]);
  });

  it.each([
    -1n,
    0x1_0000_0000_0000_0000n,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ])("invalid_magnitude_%s", (value) => {
    expect(() => cborUint(value)).toThrow(RangeError);
  });
});
