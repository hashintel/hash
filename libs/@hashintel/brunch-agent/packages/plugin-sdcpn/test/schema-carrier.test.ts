import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import { describe, expect, test } from "vitest";

import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { canonicalSchemaCarrier } from "./schema-carrier";

// Flue 2.0.3 uses this converter in ignore mode and removes the dialect marker.
const providerSchema = (schema: v.GenericSchema) => {
  const { $schema: _dialect, ...jsonSchema } = toJsonSchema(schema, {
    errorMode: "ignore",
  });
  return jsonSchema;
};

// Retained interim converter oracle only; production addType now uses native Zod.
const addType = {
  input: canonicalSchemaCarrier(
    petrinautAiTools.addType.inputSchema.toJSONSchema(),
  ),
};
const nestedType = {
  id: "qualification",
  name: "Qualification",
  iconSlug: "circle",
  displayColor: "#808080",
  elements: [{ elementId: "family", name: "family", type: "string" }],
};

describe("canonical schema carrier", () => {
  test("locally carries root addArc with the canonical discriminator, typed constants and positive bound", () => {
    const { $schema: _dialect, ...canonical } =
      petrinautAiTools.addArc.inputSchema.toJSONSchema();
    const carrier = canonicalSchemaCarrier(canonical);
    expect(providerSchema(carrier)).toEqual(canonical);
    const rootArc = {
      transitionId: "transition",
      arcDirection: "input",
      placeId: "place",
      weight: 1,
      type: "standard",
    };
    expect(v.parse(carrier, rootArc)).toEqual(rootArc);
    for (const weight of [0, -1, "1"]) {
      expect(v.safeParse(carrier, { ...rootArc, weight }).success).toBe(false);
    }
  });
  test("carries addPlace required booleans, finite coordinates and bounded optional capacity without defaults", () => {
    const { $schema: _dialect, ...canonical } =
      petrinautAiTools.addPlace.inputSchema.toJSONSchema();
    const carrier = canonicalSchemaCarrier(canonical);
    expect(providerSchema(carrier)).toEqual(canonical);
    const place = {
      id: "place",
      name: "Place",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: -1.5,
    };
    for (const input of [
      place,
      { ...place, capacity: null },
      { ...place, capacity: 0 },
      { ...place, capacity: Number.MAX_SAFE_INTEGER },
    ]) {
      expect(v.parse(carrier, input)).toEqual(
        petrinautAiTools.addPlace.inputSchema.parse(input),
      );
    }
    for (const input of [
      { ...place, capacity: -1 },
      { ...place, capacity: 1.5 },
      { ...place, capacity: Number.MAX_SAFE_INTEGER + 1 },
      { ...place, capacity: "1" },
      { ...place, dynamicsEnabled: "false" },
      { ...place, dynamicsEnabled: undefined },
      { ...place, x: Infinity },
      { ...place, x: NaN },
      { ...place, invented: true },
    ]) {
      expect(v.safeParse(carrier, input).success).toBe(false);
      expect(
        petrinautAiTools.addPlace.inputSchema.safeParse(input).success,
      ).toBe(false);
    }
  });

  test("carries setNetTitle maximum length without losing its minimum", () => {
    const { $schema: _dialect, ...canonical } =
      petrinautAiTools.setNetTitle.inputSchema.toJSONSchema();
    const carrier = canonicalSchemaCarrier(canonical);
    expect(providerSchema(carrier)).toEqual(canonical);
    for (const length of [0, 1, 120, 121]) {
      const input = { title: "x".repeat(length) };
      expect(v.safeParse(carrier, input).success).toBe(
        length >= 1 && length <= 120,
      );
      expect(v.safeParse(carrier, input).success).toBe(
        petrinautAiTools.setNetTitle.inputSchema.safeParse(input).success,
      );
    }
  });

  test("refuses unproved schema vocabulary instead of silently widening it", () => {
    for (const field of [
      { type: "string", pattern: "^known$" },
      { type: "string", enum: ["known"], minLength: 2 },
      { oneOf: [{ type: "string" }, { type: "null" }] },
      { $ref: "#/$defs/recursive" },
      { type: "string", const: "place", minLength: 1 },
      { type: "number", const: 1 },
      { type: "boolean", const: true },
      { type: "number", minimum: 0, multipleOf: 2 },
      { type: "integer", maximum: 10, exclusiveMaximum: 9 },
      { type: "boolean", default: false },
      {
        type: "object",
        properties: {},
        required: ["missing"],
        additionalProperties: false,
      },
    ] satisfies Parameters<typeof canonicalSchemaCarrier>[0][]) {
      expect(() =>
        canonicalSchemaCarrier({
          type: "object",
          properties: { field },
          additionalProperties: false,
        }),
      ).toThrow(/Unsupported/u);
    }
  });

  test("refuses overlapping, optional or constrained oneOf discriminators and unhandled union siblings", () => {
    const alternative = {
      type: "object",
      properties: { kind: { type: "string", const: "a" } },
      required: ["kind"],
      additionalProperties: false,
    } satisfies Parameters<typeof canonicalSchemaCarrier>[0];
    const other = {
      ...alternative,
      properties: { kind: { type: "string", const: "b" } },
    } satisfies Parameters<typeof canonicalSchemaCarrier>[0];
    for (const field of [
      { oneOf: [alternative, alternative] },
      { oneOf: [alternative, { ...other, required: [] }] },
      {
        oneOf: [
          alternative,
          {
            ...other,
            properties: { kind: { type: "string", const: "b", pattern: "b" } },
          },
        ],
      },
      { oneOf: [alternative, { ...other, unevaluatedProperties: false }] },
      { oneOf: [alternative, other], anyOf: [{ type: "null" }] },
      { anyOf: [{ type: "string" }, { type: "null" }], type: "string" },
    ] satisfies Parameters<typeof canonicalSchemaCarrier>[0][]) {
      expect(() =>
        canonicalSchemaCarrier({
          type: "object",
          properties: { field },
          additionalProperties: false,
        }),
      ).toThrow(/Unsupported/u);
    }
  });

  test("derives a Valibot schema structurally equal to the canonical JSON Schema for each admitted class", () => {
    const { $schema: _dialect, ...canonical } =
      petrinautAiTools.addType.inputSchema.toJSONSchema();
    expect(providerSchema(addType.input!)).toEqual(canonical);
  });

  test("carries real nested objects without serializing or dropping them", () => {
    expect(v.parse(addType.input!, nestedType)).toEqual(nestedType);
    expect(
      v.safeParse(addType.input!, {
        ...nestedType,
        elements: JSON.stringify(nestedType.elements),
      }).success,
    ).toBe(false);
  });

  test("retains canonical strictness at the root and nested boundaries", () => {
    for (const input of [
      { ...nestedType, invented: true },
      {
        ...nestedType,
        elements: [{ ...nestedType.elements[0], invented: true }],
      },
      { ...nestedType, elements: [{ elementId: "family", name: "family" }] },
      { ...nestedType, id: "" },
    ]) {
      expect(v.safeParse(addType.input!, input).success).toBe(false);
    }
  });
});
