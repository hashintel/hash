import { describe, expect, it } from "vitest";

import { encodeToken } from "./encode-token";
import { fieldHex, memoryGroups, stringPoolId } from "./token-memory";

const bitsOf = (byte: { bits: { value: number }[] }): string =>
  byte.bits.map((bit) => bit.value).join("");

describe("memoryGroups", () => {
  const { layout, bytes } = encodeToken(
    [
      { name: "amount", type: "real" },
      { name: "active", type: "boolean" },
    ],
    { amount: -1.25, active: true },
  );

  it("lists a group per field and per stretch of padding, in memory order", () => {
    const groups = memoryGroups(layout, bytes, "memory");

    expect(
      groups.map((group) => [
        group.field?.element.name ?? "padding",
        group.byteOffset,
        group.bytes.length,
      ]),
    ).toEqual([
      ["amount", 0, 8],
      ["active", 8, 1],
      ["padding", 9, 7],
    ]);
    expect(groups[1]?.bytes.map(bitsOf)).toEqual(["00000001"]);
    expect(groups[2]?.bytes[0]).toEqual({ label: "b9", bits: [] });
  });

  it("puts the most significant byte first in logical order", () => {
    // -1.25 is 0xbff4000000000000: sign 1, exponent 01111111111, mantissa 0100…
    const [amount] = memoryGroups(layout, bytes, "logical");

    expect(amount?.bytes.map((byte) => byte.label)).toEqual([
      "b7",
      "b6",
      "b5",
      "b4",
      "b3",
      "b2",
      "b1",
      "b0",
    ]);
    expect(amount?.bytes.slice(0, 2).map(bitsOf)).toEqual([
      "10111111",
      "11110100",
    ]);
    expect(amount?.bytes[0]?.bits.map((bit) => bit.part)).toEqual([
      "sign",
      ...Array.from({ length: 7 }, () => "exponent"),
    ]);
    expect(amount?.bytes[1]?.bits.map((bit) => bit.part)).toEqual([
      ...Array.from({ length: 4 }, () => "exponent"),
      ...Array.from({ length: 4 }, () => "mantissa"),
    ]);
  });

  it("follows the buffer in memory order", () => {
    const [amount] = memoryGroups(layout, bytes, "memory");

    expect(amount?.bytes.map((byte) => byte.label)).toEqual([
      "b0",
      "b1",
      "b2",
      "b3",
      "b4",
      "b5",
      "b6",
      "b7",
    ]);
    expect(amount?.bytes.slice(6).map(bitsOf)).toEqual([
      "11110100",
      "10111111",
    ]);
  });

  it("names the lane of each byte of a UUID", () => {
    const uuid = encodeToken([{ name: "id", type: "uuid" }], {});
    const [id] = memoryGroups(uuid.layout, uuid.bytes, "memory");

    expect(id?.bytes[0]?.label).toBe("b0 lo");
    expect(id?.bytes[8]?.label).toBe("b8 hi");
    expect(id?.bytes[0]?.bits[0]?.part).toBe("plain");
  });
});

describe("fieldHex", () => {
  it("writes the field as one number, most significant digit first", () => {
    const { layout, bytes } = encodeToken([{ name: "amount", type: "real" }], {
      amount: 1.25,
    });

    expect(fieldHex(bytes, layout.fields[0]!)).toBe("0x3ff4000000000000");
  });
});

describe("stringPoolId", () => {
  it("reads the id a string field holds", () => {
    const { layout, bytes } = encodeToken(
      [
        { name: "first", type: "string" },
        { name: "second", type: "string" },
      ],
      { first: "alpha", second: "beta" },
    );

    expect(layout.fields.map((field) => stringPoolId(bytes, field))).toEqual([
      1, 2,
    ]);
  });
});
