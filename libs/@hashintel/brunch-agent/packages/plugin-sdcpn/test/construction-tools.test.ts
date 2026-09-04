import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import { describe, expect, test } from "vitest";

import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { sdcpnInitialDataSchema } from "../src/flue";
import {
  PETRINAUT_CONSTRUCTION_TOOL_NAMES,
  petrinautConstructionTools,
} from "../src/tools/petrinaut-construction";

const toolByName = (toolName: string) => {
  const constructionTool = petrinautConstructionTools.find(
    (candidateTool) => candidateTool.name === toolName,
  );
  if (!constructionTool)
    throw new Error(`Missing construction tool ${toolName}`);
  return constructionTool;
};

describe("Petrinaut construction tools", () => {
  test("admits the interactive scratch-project construction mode", () => {
    expect(
      v.safeParse(sdcpnInitialDataSchema, {
        mode: "scratch-project-construction",
      }).success,
    ).toBe(true);
  });

  test("exposes exactly the bounded canonical subset", () => {
    expect(petrinautConstructionTools.map((tool) => tool.name)).toEqual([
      ...PETRINAUT_CONSTRUCTION_TOOL_NAMES,
    ]);
  });

  test("mechanically carries the canonical input contract", () => {
    for (const toolName of PETRINAUT_CONSTRUCTION_TOOL_NAMES) {
      const constructionTool = toolByName(toolName);
      expect(constructionTool.description).toContain(
        petrinautAiTools[toolName].description,
      );
      expect(constructionTool.description).toContain(
        JSON.stringify(petrinautAiTools[toolName].inputSchema.toJSONSchema()),
      );
    }
  });

  test("exposes canonical structural fields to the model provider", () => {
    const addTypeSchema = toJsonSchema(toolByName("addType").input!, {
      errorMode: "ignore",
    });
    const addTransitionSchema = toJsonSchema(
      toolByName("addTransition").input!,
      { errorMode: "ignore" },
    );
    const addPlaceSchema = toJsonSchema(toolByName("addPlace").input!, {
      errorMode: "ignore",
    });
    const addArcSchema = toJsonSchema(toolByName("addArc").input!, {
      errorMode: "ignore",
    });

    expect(addTypeSchema).toMatchObject({
      type: "object",
      properties: {
        elements: {
          type: "array",
          items: {
            type: "object",
            required: ["elementId", "name", "type"],
          },
        },
      },
      required: ["id", "name", "iconSlug", "displayColor", "elements"],
    });
    expect(addTransitionSchema).toMatchObject({
      type: "object",
      properties: {
        inputArcs: { type: "array" },
        outputArcs: { type: "array" },
        x: { type: "number" },
        y: { type: "number" },
      },
      required: [
        "id",
        "name",
        "inputArcs",
        "outputArcs",
        "lambdaType",
        "lambdaCode",
        "transitionKernelCode",
        "x",
        "y",
      ],
    });
    expect(addPlaceSchema).toMatchObject({
      properties: {
        capacity: {
          anyOf: [
            {
              type: "integer",
              minimum: 0,
              maximum: Number.MAX_SAFE_INTEGER,
            },
            { type: "null" },
          ],
        },
      },
    });
    expect(addArcSchema).toMatchObject({
      properties: {
        arcDirection: { enum: ["input", "output"] },
        weight: { type: "number", exclusiveMinimum: 0 },
      },
    });
  });

  test("delegates accepted and rejected inputs to Petrinaut's Zod schemas", () => {
    const addArc = toolByName("addArc");
    const validArc = {
      transitionId: "transition",
      arcDirection: "output",
      placeId: "place",
      weight: 1,
      targetSubnetId: null,
    };
    const invalidArc = { ...validArc, type: "standard" };

    expect(v.safeParse(addArc.input!, invalidArc).success).toBe(
      petrinautAiTools.addArc.inputSchema.safeParse(invalidArc).success,
    );
    expect(v.safeParse(addArc.input!, validArc).success).toBe(
      petrinautAiTools.addArc.inputSchema.safeParse(validArc).success,
    );
  });

  test("retains nested values in canonical validation paths", () => {
    const addType = toolByName("addType");
    const invalidElement = {
      elementId: "speed",
      name: "not valid",
      type: "real",
    };
    const invalidType = {
      id: "vehicle",
      name: "Vehicle",
      iconSlug: "circle",
      displayColor: "#808080",
      elements: [invalidElement],
    };
    const result = v.safeParse(addType.input!, invalidType);
    if (result.success) throw new Error("Expected nested type rejection");

    expect(result.issues[0].path).toMatchObject([
      { input: invalidType, key: "elements", value: invalidType.elements },
      { input: invalidType.elements, key: 0, value: invalidElement },
      { input: invalidElement, key: "name", value: "not valid" },
    ]);
  });
});
