import { describe, expect, it } from "vitest";

import { decodeScipIndex, scipDefinitionRole } from "./scip-decode";

/** Protobuf wire helpers, enough to build an index by hand. */
const varint = (value: number): number[] => {
  const bytes: number[] = [];
  let rest = value;
  while (rest >= 0x80) {
    bytes.push((rest % 0x80) + 0x80);
    rest = Math.floor(rest / 0x80);
  }
  bytes.push(rest);
  return bytes;
};
const field = (number: number, wireType: number): number[] =>
  varint(number * 8 + wireType);
const bytesField = (number: number, payload: number[]): number[] => [
  ...field(number, 2),
  ...varint(payload.length),
  ...payload,
];
const stringField = (number: number, text: string): number[] =>
  bytesField(number, [...new TextEncoder().encode(text)]);
const varintField = (number: number, value: number): number[] => [
  ...field(number, 0),
  ...varint(value),
];

const occurrence = (symbol: string, roles: number): number[] => [
  ...bytesField(1, [...varint(3), ...varint(0), ...varint(3), ...varint(4)]),
  ...stringField(2, symbol),
  ...varintField(3, roles),
  ...varintField(5, 7),
];

const document = (path: string, occurrences: number[][]): number[] => [
  ...stringField(1, path),
  ...occurrences.flatMap((entry) => bytesField(2, entry)),
  ...stringField(4, "python"),
];

describe("decodeScipIndex", () => {
  it("reads documents, paths, symbols and roles, skipping other fields", () => {
    const index = new Uint8Array([
      ...bytesField(1, stringField(1, "metadata")),
      ...bytesField(
        2,
        document("petrinaut/session.py", [
          occurrence("py petrinaut.session/Session#", scipDefinitionRole),
          occurrence("py petrinaut.errors/Error#", 0),
        ]),
      ),
      ...bytesField(2, document("petrinaut/errors.py", [])),
    ]);

    expect(decodeScipIndex(index)).toEqual([
      {
        relativePath: "petrinaut/session.py",
        occurrences: [
          { symbol: "py petrinaut.session/Session#", symbolRoles: 1 },
          { symbol: "py petrinaut.errors/Error#", symbolRoles: 0 },
        ],
      },
      { relativePath: "petrinaut/errors.py", occurrences: [] },
    ]);
  });

  it("decodes multi-byte varints and 64-bit and 32-bit fixed fields", () => {
    const index = new Uint8Array([
      ...field(7, 1),
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      ...field(8, 5),
      1,
      2,
      3,
      4,
      ...bytesField(2, document("a.py", [occurrence("s", 300)])),
    ]);

    expect(decodeScipIndex(index)[0]?.occurrences[0]?.symbolRoles).toBe(300);
  });

  it("refuses a truncated index", () => {
    expect(() => decodeScipIndex(new Uint8Array([0x12, 0x05, 0x0a]))).toThrow(
      "truncated",
    );
  });
});
