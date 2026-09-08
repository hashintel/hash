import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import { describe, expect, test } from "vitest";

import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { canonicalSchemaCarrier } from "../src/tools/canonical-schema-carrier";
import { petrinautConstructionTools } from "../src/tools/petrinaut-construction";

// Flue 2.0.3 uses this converter in ignore mode and removes the dialect marker.
const providerSchema = (schema: v.GenericSchema) => {
  const { $schema: _dialect, ...jsonSchema } = toJsonSchema(schema, {
    errorMode: "ignore",
  });
  return jsonSchema;
};

const addType = petrinautConstructionTools.find(
  (tool) => tool.name === "addType",
)!;
const nestedType = {
  id: "qualification",
  name: "Qualification",
  iconSlug: "circle",
  displayColor: "#808080",
  elements: [{ elementId: "family", name: "family", type: "string" }],
};

describe("canonical schema carrier", () => {
  test("refuses unproved schema vocabulary instead of silently widening it", () => {
    for (const field of [
      { type: "string", pattern: "^known$" },
      { type: "string", enum: ["known"], minLength: 2 },
      { oneOf: [{ type: "string" }, { type: "null" }] },
      { $ref: "#/$defs/recursive" },
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
