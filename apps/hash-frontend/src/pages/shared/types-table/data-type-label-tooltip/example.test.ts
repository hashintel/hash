import { describe, expect, it } from "vitest";

import { getDataTypeLabelExample } from "./example";

import type {
  DataType,
  DataTypeWithMetadata,
  SingleValueSchema,
  StringFormat,
  VersionedUrl,
} from "@blockprotocol/type-system";

const type = (
  name: string,
  schema:
    | SingleValueSchema
    | { anyOf: [SingleValueSchema, ...SingleValueSchema[]] },
  parents: DataType[] = [],
): DataType => ({
  $id: `https://example.com/types/data-type/${name}/v/1`,
  $schema: "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
  kind: "dataType",
  title: name,
  description: name,
  label: { right: "units" },
  ...schema,
  allOf: parents.map(({ $id }) => ({ $ref: $id })),
});
const lookup = (
  ...schemas: DataType[]
): Record<VersionedUrl, DataTypeWithMetadata> =>
  Object.fromEntries(
    schemas.map((schema) => [schema.$id, { schema } as DataTypeWithMetadata]),
  );
const example = (schema: DataType, parents: DataType[] = []) =>
  getDataTypeLabelExample(schema, lookup(...parents))
    ?.map(({ text }) => text)
    .join("");

describe("label tooltip examples", () => {
  it("uses regular value parts and preserves both labels", () => {
    const schema = type("rate", {
      type: "number",
      label: { left: "$", right: "/h" },
    });
    expect(example(schema)).toBe("$42 /h");
    expect(
      getDataTypeLabelExample(schema, {})?.filter(
        ({ kind }) => kind === "value",
      ),
    ).toEqual([{ kind: "value", text: "42" }]);
  });

  it("intersects inherited bounds, exclusive limits, and decimal steps", () => {
    const parent = type("parent", {
      type: "number",
      minimum: 0,
      maximum: 1,
      multipleOf: 0.1,
    });
    const child = type(
      "child",
      { type: "number", exclusiveMinimum: 0.2, exclusiveMaximum: 0.4 },
      [parent],
    );
    expect(example(child, [parent])).toBe("0.3 units");
  });

  it("satisfies multiple inherited divisibility rules", () => {
    const parent = type("parent", { type: "number", multipleOf: 4 });
    const child = type(
      "child",
      { type: "number", minimum: 1, maximum: 100, multipleOf: 6 },
      [parent],
    );
    const value = Number(example(child, [parent])?.split(" ")[0]);
    expect(value % 12).toBe(0);
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(100);
  });

  it("selects a permitted enum member, including zero", () => {
    const parent = type("parent", { type: "number", maximum: 1 });
    expect(
      example(type("enum", { type: "number", enum: [2, 0] }, [parent]), [
        parent,
      ]),
    ).toBe("0 units");
    expect(
      example(type("text", { type: "string", enum: ["red", "green"] })),
    ).toBe("red units");
  });

  it("samples inside a narrow open interval", () => {
    const value = Number(
      example(
        type("small", {
          type: "number",
          exclusiveMinimum: 0.002,
          exclusiveMaximum: 0.003,
        }),
      )?.split(" ")[0],
    );
    expect(value).toBeGreaterThan(0.002);
    expect(value).toBeLessThan(0.003);
  });

  it("inherits labels without discarding the child's constraints", () => {
    const parent = type("parent", { type: "number", label: { right: "m" } });
    const child = type(
      "child",
      { type: "number", label: undefined, enum: [12] },
      [parent],
    );
    expect(example(child, [parent])).toBe("12 m");
  });

  it("honors text length limits and counts Unicode characters", () => {
    expect(example(type("short", { type: "string", maxLength: 3 }))).toBe(
      "ABC units",
    );
    expect(
      example(
        type("long", { type: "string", minLength: 20, maxLength: 20 }),
      )?.replace(" units", "").length,
    ).toBe(20);
    expect(
      example(
        type("emoji", { type: "string", enum: ["😀"] }, [
          type("one", { type: "string", maxLength: 1 }),
        ]),
        [type("one", { type: "string", maxLength: 1 })],
      ),
    ).toBe("😀 units");
    expect(example(type("empty", { type: "string", maxLength: 0 }))).toBe(
      '"" units',
    );
  });

  it.each<[StringFormat, string]>([
    ["uri", "https://example.com"],
    ["email", "alex@example.com"],
    ["date", "2026-01-15"],
    ["date-time", "2026-01-15T14:30:00Z"],
    ["time", "14:30:00Z"],
    ["duration", "PT1H30M"],
    ["hostname", "example.com"],
    ["ipv4", "192.0.2.1"],
    ["ipv6", "2001:db8::1"],
    ["uuid", "123e4567-e89b-42d3-a456-426614174000"],
    ["regex", "[A-Z]+"],
  ])("uses a representative %s value", (format, value) => {
    const parent = type("parent", { type: "string", format });
    expect(example(type("child", { type: "string" }, [parent]), [parent])).toBe(
      `${value} units`,
    );
  });

  it("generates text for common patterns and checks inherited patterns", () => {
    const hex = example(
      type("hex", { type: "string", pattern: "^#[a-fA-F0-9]{6}$" }),
    )?.replace(" units", "");
    expect(hex).toMatch(/^#[a-fA-F0-9]{6}$/u);
    const parent = type("parent", { type: "string", pattern: "^[A-Z]+$" });
    expect(
      example(
        type("child", { type: "string", enum: ["abc", "RGB"] }, [parent]),
        [parent],
      ),
    ).toBe("RGB units");
  });

  it("formats each component of an inherited RGB tuple", () => {
    const parent = type("rgb", {
      type: "array",
      items: false,
      prefixItems: [
        {
          type: "number",
          minimum: 0,
          maximum: 255,
          multipleOf: 1,
          label: { right: "R" },
        },
        {
          type: "number",
          minimum: 0,
          maximum: 255,
          multipleOf: 1,
          label: { right: "G" },
        },
        {
          type: "number",
          minimum: 0,
          maximum: 255,
          multipleOf: 1,
          label: { right: "B" },
        },
      ],
      label: { right: "RGB" },
    });
    expect(
      example(type("child", { type: "array", label: undefined }, [parent]), [
        parent,
      ]),
    ).toBe("[42 R, 128 G, 224 B] RGB");
  });

  it("applies list item constraints and length bounds from ancestors", () => {
    const parent = type("parent", {
      type: "array",
      items: { type: "number", minimum: 0, maximum: 1, label: { right: "m" } },
      minItems: 3,
    });
    expect(
      example(type("child", { type: "array", maxItems: 3 }, [parent]), [
        parent,
      ]),
    ).toBe("[1 m, 1 m, 1 m] units");
    expect(example(type("empty", { type: "array", maxItems: 0 }))).toBe(
      "[] units",
    );
  });

  it("finds a compatible union branch across parents", () => {
    const parent = type("parent", {
      anyOf: [
        { type: "number", maximum: 10 },
        { type: "string", enum: ["blue"] },
      ],
    });
    const child = type(
      "child",
      { anyOf: [{ type: "number", minimum: 20 }, { type: "string" }] },
      [parent],
    );
    expect(example(child, [parent])).toBe("blue units");
  });

  it("supports the other primitive values", () => {
    expect(example(type("bool", { type: "boolean" }))).toBe("true units");
    expect(example(type("null", { type: "null" }))).toBe("null units");
    expect(example(type("object", { type: "object" }))).toBe(
      '{"name":"Example"} units',
    );
  });

  it("does not invent examples for conflicting, unsupported, or oversized constraints", () => {
    for (const schema of [
      type("conflict", { type: "number", minimum: 10, maximum: 1 }),
      type("step", {
        type: "number",
        exclusiveMinimum: 0,
        exclusiveMaximum: 1,
        multipleOf: 1,
      }),
      type("pattern", { type: "string", pattern: "^(a+)+$" }),
      type("invalid-pattern", { type: "string", pattern: "[" }),
      type("large-text", { type: "string", minLength: 1_000_000 }),
      type("large-list", { type: "array", minItems: 1_000_000 }),
      type("missing-parent", { type: "number" }, [
        type("missing", { type: "number" }),
      ]),
    ]) {
      expect(example(schema), schema.title).toBeUndefined();
    }
  });
});
