import { describe, expect, it } from "vitest";

import { encodeToken, encodeTokenSource } from "./encode-token";

describe("encodeToken", () => {
  it("reads back what the codec coerced the values to", () => {
    const { layout, bytes, decoded } = encodeToken(
      [
        { name: "active", type: "boolean" },
        { name: "amount", type: "real" },
        { name: "count", type: "integer" },
      ],
      { active: true, amount: 1.25, count: 2.7 },
    );

    expect(decoded).toEqual({ active: true, amount: 1.25, count: 3 });
    // Two f64 fields first, then the boolean, padded to a multiple of eight.
    expect(layout.fields.map((field) => field.element.name)).toEqual([
      "amount",
      "count",
      "active",
    ]);
    expect(bytes).toHaveLength(24);
  });

  it("stores a string as an id into its pool", () => {
    const { bytes, decoded } = encodeToken(
      [{ name: "label", type: "string" }],
      {
        label: "alpha",
      },
    );

    expect(decoded).toEqual({ label: "alpha" });
    // Id 0 is the empty string every pool starts with.
    expect(new DataView(bytes.buffer).getBigUint64(0, true)).toBe(1n);
  });

  it("gives a dimension the token leaves out the default of its type", () => {
    const { decoded } = encodeToken([{ name: "count", type: "integer" }], {});

    expect(decoded).toEqual({ count: 0 });
  });

  it("refuses two dimensions of one name", () => {
    expect(() =>
      encodeToken(
        [
          { name: "a", type: "real" },
          { name: "b", type: "boolean" },
          { name: "a", type: "integer" },
        ],
        { a: 2.7 },
      ),
    ).toThrow('Two dimensions are named "a". Give each a name of its own.');
  });
});

describe("encodeTokenSource", () => {
  const dimensions = [{ name: "count", type: "integer" }] as const;

  it("encodes the object the source evaluates to", () => {
    const encoding = encodeTokenSource(dimensions, "{ count: 2 + 2 } // four");

    expect(encoding).toMatchObject({ decoded: { count: 4 } });
  });

  it("reports a source that does not parse", () => {
    expect(encodeTokenSource(dimensions, "{ count: ")).toEqual({
      error: expect.any(String),
    });
  });

  it("reports a source that is not an object", () => {
    expect(encodeTokenSource(dimensions, "42")).toEqual({
      error: "The token must be an object, such as { amount: 1.25 }",
    });
  });

  it("reports a value the codec cannot coerce", () => {
    const encoding = encodeTokenSource(dimensions, '{ count: "many" }');

    expect(encoding).toEqual({ error: expect.stringContaining("token.count") });
  });
});
