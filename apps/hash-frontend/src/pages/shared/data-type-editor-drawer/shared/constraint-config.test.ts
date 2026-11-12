import { describe, expect, it } from "vitest";

import {
  activeConstraintKinds,
  collectDescendantTypeTitles,
  constraintValueEquals,
  constraintValuesFromSchema,
  deriveInheritedConstraints,
  formatConstraintValue,
  primitiveArmOfUnion,
  schemaConstraintsFromValues,
  sharedParentPrimitive,
  summarizeTypeTitles,
  visibleConstraintKinds,
} from "./constraint-config";

import type {
  ConstraintPrimitive,
  ConstraintValues,
} from "./constraint-config";
import type {
  BaseUrl,
  DataType,
  DataTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

describe("constraintValuesFromSchema", () => {
  it("reads number bounds with their exclusivity", () => {
    expect(
      constraintValuesFromSchema({
        type: "number",
        exclusiveMinimum: 0,
        maximum: 100,
        multipleOf: 5,
      }),
    ).toEqual({
      minimum: { value: 0, exclusive: true },
      maximum: { value: 100, exclusive: false },
      multipleOf: 5,
    });
  });

  it("reads string constraints including format", () => {
    expect(
      constraintValuesFromSchema({
        type: "string",
        minLength: 2,
        maxLength: 10,
        pattern: "^[A-Z]+$",
        format: "email",
      }),
    ).toEqual({
      minLength: 2,
      maxLength: 10,
      pattern: "^[A-Z]+$",
      format: "email",
    });
  });

  it("reads an enum as permitted values", () => {
    expect(
      constraintValuesFromSchema({ type: "string", enum: ["a", "b"] }),
    ).toEqual({ enum: ["a", "b"] });
  });

  it("reads flexible array constraints but skips tuples", () => {
    expect(
      constraintValuesFromSchema({
        type: "array",
        items: { type: "number" },
        minItems: 1,
        maxItems: 3,
      }),
    ).toEqual({ items: "number", minItems: 1, maxItems: 3 });

    expect(
      constraintValuesFromSchema({
        type: "array",
        items: false,
        prefixItems: [{ type: "number" }],
      }),
    ).toEqual({});
  });

  it("reads nothing from an anyOf schema", () => {
    expect(constraintValuesFromSchema({ anyOf: [{ type: "string" }] })).toEqual(
      {},
    );
  });
});

describe("schemaConstraintsFromValues", () => {
  it("serializes number bounds back to the exclusive keys", () => {
    expect(
      schemaConstraintsFromValues({
        primitive: "number",
        activeKinds: ["minimum", "maximum", "multipleOf"],
        values: {
          minimum: { value: 0, exclusive: true },
          maximum: { value: 100, exclusive: false },
          multipleOf: 5,
        },
      }),
    ).toEqual({ exclusiveMinimum: 0, maximum: 100, multipleOf: 5 });
  });

  it("skips kinds that are not active or have no value", () => {
    expect(
      schemaConstraintsFromValues({
        primitive: "string",
        activeKinds: ["minLength"],
        values: { minLength: 2, maxLength: 10 },
      }),
    ).toEqual({ minLength: 2 });
  });

  it("lets a non-empty enum win over other constraints", () => {
    expect(
      schemaConstraintsFromValues({
        primitive: "string",
        activeKinds: ["enum", "minLength"],
        values: { enum: ["a"], minLength: 2 },
      }),
    ).toEqual({ enum: ["a"] });
  });

  it("parses numeric permitted values and drops the rest", () => {
    expect(
      schemaConstraintsFromValues({
        primitive: "number",
        activeKinds: ["enum"],
        values: { enum: ["25", 50, "not a number"] },
      }),
    ).toEqual({ enum: [25, 50] });
  });

  it("serializes array constraints to an item schema and bounds", () => {
    expect(
      schemaConstraintsFromValues({
        primitive: "array",
        activeKinds: ["items", "minItems"],
        values: { items: "string", minItems: 1 },
      }),
    ).toEqual({ items: { type: "string" }, minItems: 1 });
  });

  it("drops kinds that do not apply to the primitive", () => {
    expect(
      schemaConstraintsFromValues({
        primitive: "number",
        activeKinds: ["minLength", "pattern"],
        values: { minLength: 2, pattern: "^a$" },
      }),
    ).toEqual({});
  });
});

describe("activeConstraintKinds", () => {
  it("lists the kinds holding a value, treating an empty enum as unset", () => {
    const values: ConstraintValues = {
      minimum: { value: 0, exclusive: false },
      enum: [],
      pattern: "^a$",
    };

    expect(activeConstraintKinds(values)).toEqual(["minimum", "pattern"]);
  });
});

describe("constraintValueEquals", () => {
  it("compares bounds including exclusivity", () => {
    const inherited: ConstraintValues = {
      minimum: { value: 0, exclusive: false },
    };

    expect(
      constraintValueEquals(
        "minimum",
        { minimum: { value: 0, exclusive: false } },
        inherited,
      ),
    ).toBe(true);
    expect(
      constraintValueEquals(
        "minimum",
        { minimum: { value: 0, exclusive: true } },
        inherited,
      ),
    ).toBe(false);
    expect(constraintValueEquals("minimum", {}, inherited)).toBe(false);
  });

  it("compares enums as unordered sets", () => {
    expect(
      constraintValueEquals("enum", { enum: ["b", "a"] }, { enum: ["a", "b"] }),
    ).toBe(true);
    expect(
      constraintValueEquals("enum", { enum: ["a"] }, { enum: ["a", "b"] }),
    ).toBe(false);
  });

  it("compares scalar kinds directly", () => {
    expect(
      constraintValueEquals("pattern", { pattern: "^a$" }, { pattern: "^a$" }),
    ).toBe(true);
    expect(
      constraintValueEquals("minLength", { minLength: 2 }, { minLength: 3 }),
    ).toBe(false);
  });
});

describe("formatConstraintValue", () => {
  it("formats bounds, enums, and labelled kinds", () => {
    expect(
      formatConstraintValue("minimum", {
        minimum: { value: 5, exclusive: true },
      }),
    ).toBe("5 (exclusive)");
    expect(formatConstraintValue("enum", { enum: [25, 50] })).toBe("25, 50");
    expect(formatConstraintValue("format", { format: "email" })).toBe(
      "Email address",
    );
    expect(formatConstraintValue("items", { items: "string" })).toBe("Text");
    expect(formatConstraintValue("maxLength", { maxLength: 10 })).toBe("10");
  });

  it("caps enums at five values and truncates long ones", () => {
    expect(formatConstraintValue("enum", { enum: [1, 2, 3, 4, 5, 6, 7] })).toBe(
      "1, 2, 3, 4, 5 and 2 more",
    );
    expect(
      formatConstraintValue("enum", { enum: [`${"x".repeat(40)}y`] }),
    ).toBe(`${"x".repeat(40)}…`);
  });
});

describe("summarizeTypeTitles", () => {
  it("summarizes beyond two titles and truncates long ones", () => {
    expect(summarizeTypeTitles(["Metre", "Foot"])).toBe("Metre and Foot");
    expect(summarizeTypeTitles(["Metre", "Foot", "Inch", "Mile"])).toBe(
      "Metre, Foot and 2 more",
    );
    expect(summarizeTypeTitles([`${"A".repeat(39)} tail`])).toBe(
      `${"A".repeat(39)}…`,
    );
  });
});

describe("visibleConstraintKinds", () => {
  it("ignores active kinds that do not apply to the primitive", () => {
    expect(
      visibleConstraintKinds({
        primitive: "number",
        activeKinds: ["minLength", "pattern"],
        inheritedValues: {},
      }),
    ).toEqual([]);
  });

  it("merges applicable own and inherited kinds", () => {
    expect(
      visibleConstraintKinds({
        primitive: "number",
        activeKinds: ["multipleOf", "minLength"],
        inheritedValues: { minimum: { value: 0, exclusive: false } },
      }),
    ).toEqual(["minimum", "multipleOf"]);
  });

  it("is always empty for primitives without constraints", () => {
    expect(
      visibleConstraintKinds({
        primitive: "boolean",
        activeKinds: ["minimum"],
        inheritedValues: { minimum: { value: 0, exclusive: false } },
      }),
    ).toEqual([]);
  });
});

describe("deriveInheritedConstraints", () => {
  const dataTypeId = (name: string) =>
    `https://example.com/@test/types/data-type/${name}/v/1` as VersionedUrl;

  const makeDataType = (
    name: string,
    schema: Partial<DataType>,
  ): DataTypeWithMetadata =>
    ({
      schema: {
        $id: dataTypeId(name.toLowerCase()),
        title: name,
        ...schema,
      },
    }) as DataTypeWithMetadata;

  const lineage: Record<string, DataTypeWithMetadata> = {
    [dataTypeId("number")]: makeDataType("Number", { type: "number" }),
    [dataTypeId("positive")]: makeDataType("Positive", {
      type: "number",
      exclusiveMinimum: 0,
      allOf: [{ $ref: dataTypeId("number") }],
    }),
    [dataTypeId("percentage")]: makeDataType("Percentage", {
      type: "number",
      minimum: 0,
      maximum: 100,
      allOf: [{ $ref: dataTypeId("positive") }],
    }),
  };

  const resolveDataType = (id: VersionedUrl) => lineage[id];

  it("collects constraints across the ancestry", () => {
    expect(
      deriveInheritedConstraints({
        parentDataTypeIds: [dataTypeId("positive")],
        resolveDataType,
      }),
    ).toEqual({
      values: { minimum: { value: 0, exclusive: true } },
      sources: {
        minimum: { title: "Positive", dataTypeId: dataTypeId("positive") },
      },
    });
  });

  it("attributes each kind to the nearest ancestor defining it", () => {
    const inherited = deriveInheritedConstraints({
      parentDataTypeIds: [dataTypeId("percentage")],
      resolveDataType,
    });

    expect(inherited.values).toEqual({
      minimum: { value: 0, exclusive: false },
      maximum: { value: 100, exclusive: false },
    });
    expect(inherited.sources.minimum?.title).toBe("Percentage");
    expect(inherited.sources.maximum?.title).toBe("Percentage");
  });

  it("collects descendant titles transitively, direct children first", () => {
    const extraLineage: Record<string, DataTypeWithMetadata> = {
      ...lineage,
      [dataTypeId("ratio")]: makeDataType("Ratio", {
        type: "number",
        allOf: [{ $ref: dataTypeId("percentage") }],
      }),
    };

    expect(
      collectDescendantTypeTitles({
        childDataTypeIds: [dataTypeId("percentage")],
        // Only its values are read, so the key shape is irrelevant here
        latestDataTypes: extraLineage as Record<BaseUrl, DataTypeWithMetadata>,
        resolveDataType: (id) => extraLineage[id],
      }),
    ).toEqual(["Percentage", "Ratio"]);
  });

  it("merges constraints across several parents, first parent winning ties", () => {
    const inherited = deriveInheritedConstraints({
      parentDataTypeIds: [dataTypeId("positive"), dataTypeId("percentage")],
      resolveDataType,
    });

    expect(inherited.values).toEqual({
      minimum: { value: 0, exclusive: true },
      maximum: { value: 100, exclusive: false },
    });
    expect(inherited.sources.minimum?.title).toBe("Positive");
    expect(inherited.sources.maximum?.title).toBe("Percentage");
  });
});

describe("sharedParentPrimitive", () => {
  const dataTypeId = (name: string) =>
    `https://example.com/@test/types/data-type/${name}/v/1` as VersionedUrl;

  const primitives: Record<string, ConstraintPrimitive | null> = {
    [dataTypeId("number")]: "number",
    [dataTypeId("meters")]: "number",
    [dataTypeId("text")]: "string",
    [dataTypeId("union")]: null,
  };

  const resolvePrimitive = (id: VersionedUrl) => primitives[id] ?? null;

  it("returns the primitive all parents share", () => {
    expect(
      sharedParentPrimitive({
        parentDataTypeIds: [dataTypeId("number"), dataTypeId("meters")],
        resolvePrimitive,
      }),
    ).toBe("number");
  });

  it("returns null for mismatched, union-typed, or absent parents", () => {
    expect(
      sharedParentPrimitive({
        parentDataTypeIds: [dataTypeId("number"), dataTypeId("text")],
        resolvePrimitive,
      }),
    ).toBeNull();

    expect(
      sharedParentPrimitive({
        parentDataTypeIds: [dataTypeId("union")],
        resolvePrimitive,
      }),
    ).toBeNull();

    expect(
      sharedParentPrimitive({ parentDataTypeIds: [], resolvePrimitive }),
    ).toBeNull();
  });
});

describe("primitiveArmOfUnion", () => {
  it("round-trips the primitive arm's constraints through a union", () => {
    const arm = primitiveArmOfUnion([
      { type: "string", minLength: 2, pattern: "^[A-Z]" },
      { type: "array", items: { type: "string" } },
    ]);

    expect(arm).not.toBeNull();
    expect(constraintValuesFromSchema(arm!)).toEqual({
      minLength: 2,
      pattern: "^[A-Z]",
    });
  });

  it("returns null without exactly one non-array arm", () => {
    expect(
      primitiveArmOfUnion([
        { type: "array", minItems: 1 },
        { type: "array", maxItems: 3 },
      ]),
    ).toBeNull();

    expect(
      primitiveArmOfUnion([{ type: "string" }, { type: "number" }]),
    ).toBeNull();
  });
});
