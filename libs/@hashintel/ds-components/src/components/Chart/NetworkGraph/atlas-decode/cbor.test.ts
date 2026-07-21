import { describe, expect, it } from "vitest";

import { decodeCbor, SaltileCborError } from "./cbor";

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);

const failure = (input: Uint8Array): string => {
  try {
    decodeCbor(input);
  } catch (error) {
    expect(error).toBeInstanceOf(SaltileCborError);
    return (error as SaltileCborError).message;
  }
  throw new Error("expected the payload to be rejected");
};

describe("decodeCbor", () => {
  it("decodes unsigned integers at every width", () => {
    expect(decodeCbor(bytes(0x00))).toBe(0);
    expect(decodeCbor(bytes(0x17))).toBe(23);
    expect(decodeCbor(bytes(0x18, 0x18))).toBe(24);
    expect(decodeCbor(bytes(0x18, 0xff))).toBe(255);
    expect(decodeCbor(bytes(0x19, 0x01, 0x00))).toBe(256);
    expect(decodeCbor(bytes(0x1a, 0x00, 0x01, 0x00, 0x00))).toBe(65536);
    expect(decodeCbor(bytes(0x1b, 0, 0, 0, 1, 0, 0, 0, 0))).toBe(4_294_967_296);
  });

  it("decodes negative integers", () => {
    expect(decodeCbor(bytes(0x20))).toBe(-1);
    expect(decodeCbor(bytes(0x38, 0x63))).toBe(-100);
  });

  it("rejects integers that are not shortest form", () => {
    expect(failure(bytes(0x18, 0x17))).toMatch(/shortest-form/u);
    expect(failure(bytes(0x19, 0x00, 0xff))).toMatch(/shortest-form/u);
    expect(failure(bytes(0x1a, 0, 0, 0xff, 0xff))).toMatch(/shortest-form/u);
    expect(failure(bytes(0x1b, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff))).toMatch(
      /shortest-form/u,
    );
  });

  it("rejects integers beyond the safe JavaScript range", () => {
    expect(
      failure(bytes(0x1b, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff)),
    ).toMatch(/safe JavaScript range/u);
  });

  it("returns byte strings as views over the input buffer", () => {
    const input = bytes(0x44, 0xde, 0xad, 0xbe, 0xef);
    const value = decodeCbor(input) as Uint8Array;
    expect([...value]).toEqual([0xde, 0xad, 0xbe, 0xef]);
    expect(value.buffer).toBe(input.buffer);
  });

  it("decodes text strings and rejects invalid UTF-8", () => {
    expect(decodeCbor(bytes(0x63, 0xe2, 0x82, 0xac))).toBe("\u20ac");
    expect(failure(bytes(0x62, 0xc3, 0x28))).toMatch(/not valid UTF-8/u);
  });

  it("decodes arrays, maps, booleans, null, and f32", () => {
    // {0: [1, null], 1: true, 2: 1.5f32}
    const value = decodeCbor(
      bytes(
        0xa3,
        0x00,
        0x82,
        0x01,
        0xf6,
        0x01,
        0xf5,
        0x02,
        0xfa,
        0x3f,
        0xc0,
        0x00,
        0x00,
      ),
    ) as ReadonlyMap<number, unknown>;
    expect(value.get(0)).toEqual([1, null]);
    expect(value.get(1)).toBe(true);
    expect(value.get(2)).toBe(1.5);
  });

  it("decodes f64 doubles (locate property values)", () => {
    // 0.1 has no exact f32 form, so a single-precision read would drift.
    expect(
      decodeCbor(bytes(0xfb, 0x3f, 0xb9, 0x99, 0x99, 0x99, 0x99, 0x99, 0x9a)),
    ).toBe(0.1);
    expect(decodeCbor(bytes(0xfb, 0xc0, 0x04, 0, 0, 0, 0, 0, 0))).toBe(-2.5);
  });

  it("rejects map keys that are unsorted, duplicated, or not uints", () => {
    expect(failure(bytes(0xa2, 0x01, 0x00, 0x00, 0x00))).toMatch(
      /ascending order/u,
    );
    expect(failure(bytes(0xa2, 0x01, 0x00, 0x01, 0x00))).toMatch(
      /occurs twice/u,
    );
    expect(failure(bytes(0xa1, 0x61, 0x61, 0x00))).toMatch(
      /unsigned integers/u,
    );
    expect(failure(bytes(0xa1, 0x20, 0x00))).toMatch(/unsigned integers/u);
  });

  it("rejects everything outside the profile by name", () => {
    expect(failure(bytes(0xc0, 0x00))).toMatch(/tags/u);
    expect(failure(bytes(0x5f))).toMatch(/indefinite/u);
    expect(failure(bytes(0x9f))).toMatch(/indefinite/u);
    expect(failure(bytes(0xbf))).toMatch(/indefinite/u);
    expect(failure(bytes(0xf9, 0x3c, 0x00))).toMatch(/half-precision/u);
    expect(failure(bytes(0xf7))).toMatch(/simple value 23/u);
    expect(failure(bytes(0x1c))).toMatch(/reserved additional info/u);
  });

  it("rejects truncation and trailing bytes", () => {
    expect(failure(bytes())).toMatch(/where a value is required/u);
    expect(failure(bytes(0x19, 0x01))).toMatch(/inside an integer argument/u);
    expect(failure(bytes(0x44, 0x01))).toMatch(/inside a byte string/u);
    expect(failure(bytes(0x82, 0x00))).toMatch(/where a value is required/u);
    expect(failure(bytes(0xfa, 0x3f))).toMatch(/inside a float/u);
    expect(failure(bytes(0x00, 0x00))).toMatch(/1 trailing bytes/u);
  });

  it("rejects nesting beyond the depth cap", () => {
    const deep = bytes(...Array.from({ length: 18 }, () => 0x81), 0x00);
    expect(failure(deep)).toMatch(/nesting exceeds depth 16/u);
  });

  it("carries the violating byte offset on every error", () => {
    try {
      decodeCbor(bytes(0x82, 0x00, 0x18, 0x00));
    } catch (error) {
      expect((error as SaltileCborError).offset).toBe(2);
      return;
    }
    throw new Error("unreachable");
  });
});
