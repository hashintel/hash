import { describe, expect, it } from "vitest";

import {
  formatUuid,
  generateUuidFromRng,
  isUuidString,
  NIL_UUID,
  parseUuid,
  toUuid,
} from "./uuid";

const CANONICAL = "0f9a3b5c-7d1e-4a2b-8c3d-4e5f6a7b8c9d";

describe("parseUuid / formatUuid", () => {
  it("round-trips a canonical lowercase uuid string", () => {
    const value = parseUuid(CANONICAL);
    expect(formatUuid(value)).toBe(CANONICAL);
  });

  it("parses uppercase input and formats back to lowercase", () => {
    const value = parseUuid(CANONICAL.toUpperCase());
    expect(value).toBe(parseUuid(CANONICAL));
    expect(formatUuid(value)).toBe(CANONICAL);
  });

  it("formats the nil uuid with full zero padding", () => {
    expect(formatUuid(NIL_UUID)).toBe("00000000-0000-0000-0000-000000000000");
  });

  it("round-trips the maximum 128-bit value", () => {
    const max = 2n ** 128n - 1n;
    expect(parseUuid(formatUuid(max))).toBe(max);
  });

  it("throws on malformed strings", () => {
    expect(() => parseUuid("not-a-uuid")).toThrow("Invalid UUID string");
    expect(() => parseUuid(CANONICAL.replaceAll("-", ""))).toThrow(
      "Invalid UUID string",
    );
  });
});

describe("isUuidString", () => {
  it("accepts hyphenated uuid strings of any case", () => {
    expect(isUuidString(CANONICAL)).toBe(true);
    expect(isUuidString(CANONICAL.toUpperCase())).toBe(true);
  });

  it("rejects non-uuid values", () => {
    expect(isUuidString("order-1")).toBe(false);
    expect(isUuidString(42)).toBe(false);
    expect(isUuidString(undefined)).toBe(false);
  });
});

describe("toUuid", () => {
  it("passes in-range bigints through unchanged", () => {
    const value = parseUuid(CANONICAL);
    expect(toUuid(value)).toBe(value);
    expect(toUuid(0n)).toBe(0n);
    expect(toUuid(2n ** 128n - 1n)).toBe(2n ** 128n - 1n);
  });

  it("parses valid uuid strings (any case)", () => {
    expect(toUuid(CANONICAL)).toBe(parseUuid(CANONICAL));
    expect(toUuid(CANONICAL.toUpperCase())).toBe(parseUuid(CANONICAL));
  });

  it("maps undefined and null to the nil uuid", () => {
    expect(toUuid(undefined)).toBe(NIL_UUID);
    expect(toUuid(null)).toBe(NIL_UUID);
  });

  it("converts arbitrary strings to a stable UUIDv5", () => {
    const first = toUuid("order-1");
    expect(first).toBe(toUuid("order-1"));
    expect(first).not.toBe(toUuid("order-2"));
    expect(first).not.toBe(NIL_UUID);
    // v5 version nibble and RFC 4122 variant bits.
    // eslint-disable-next-line no-bitwise -- bit inspection
    expect((first >> 76n) & 0xfn).toBe(5n);
    // eslint-disable-next-line no-bitwise -- bit inspection
    expect((first >> 62n) & 0x3n).toBe(2n);
  });

  it("converts numbers via String(value), matching the equivalent string", () => {
    expect(toUuid(42)).toBe(toUuid("42"));
    expect(toUuid(42)).toBe(toUuid(42));
  });

  it("converts out-of-range and negative bigints via String(value)", () => {
    expect(toUuid(2n ** 128n)).toBe(toUuid(String(2n ** 128n)));
    expect(toUuid(-1n)).toBe(toUuid("-1"));
  });

  it("never throws and always yields an in-range value", () => {
    for (const input of [true, {}, [], Number.NaN, "💥", ""]) {
      const value = toUuid(input);
      expect(value).toBeGreaterThanOrEqual(0n);
      expect(value).toBeLessThan(2n ** 128n);
    }
  });
});

describe("generateUuidFromRng", () => {
  it("is deterministic for the same rng state and advances the state", () => {
    const [first, stateAfterFirst] = generateUuidFromRng(42);
    const [again] = generateUuidFromRng(42);
    expect(again).toBe(first);
    expect(stateAfterFirst).not.toBe(42);

    const [second] = generateUuidFromRng(stateAfterFirst);
    expect(second).not.toBe(first);
  });

  it("forces the v4 version nibble and RFC 4122 variant bits", () => {
    let state = 7;
    for (let draw = 0; draw < 16; draw++) {
      const [uuid, nextState] = generateUuidFromRng(state);
      state = nextState;
      // eslint-disable-next-line no-bitwise -- bit inspection
      expect((uuid >> 76n) & 0xfn).toBe(4n);
      // eslint-disable-next-line no-bitwise -- bit inspection
      expect((uuid >> 62n) & 0x3n).toBe(2n);
      expect(uuid).toBeGreaterThanOrEqual(0n);
      expect(uuid).toBeLessThan(2n ** 128n);
      // The canonical string form matches the v4 shape.
      expect(formatUuid(uuid)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });
});
