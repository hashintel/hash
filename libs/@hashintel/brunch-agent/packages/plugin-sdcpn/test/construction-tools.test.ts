import * as v from "valibot";
import { describe, expect, test } from "vitest";

import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import {
  batchedConstructionMode,
  sdcpnInitialDataSchema,
  VALIDATED_CONSTRUCTION_MODE,
  validatedFixtureMutationMode,
} from "../src/flue";
import {
  PETRINAUT_CONSTRUCTION_TOOL_NAMES,
  petrinautFixtureToolNames,
  petrinautConstructionTools,
  petrinautFixtureTools,
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
  test("accepts only the ordinary headless and prepared-fixture modes", () => {
    expect(v.parse(sdcpnInitialDataSchema, undefined)).toBeUndefined();
    expect(
      v.parse(sdcpnInitialDataSchema, {
        mode: VALIDATED_CONSTRUCTION_MODE,
      }),
    ).toEqual({ mode: VALIDATED_CONSTRUCTION_MODE });
    expect(
      v.parse(sdcpnInitialDataSchema, {
        mode: validatedFixtureMutationMode,
      }),
    ).toEqual({ mode: validatedFixtureMutationMode });
    const construction = {
      binding: {
        conversationId: "conversation",
        documentId: "document",
        incarnationId: "incarnation",
      },
    };
    expect(
      v.parse(sdcpnInitialDataSchema, {
        mode: batchedConstructionMode,
        construction,
      }),
    ).toEqual({ mode: batchedConstructionMode, construction });
    expect(() =>
      v.parse(sdcpnInitialDataSchema, {
        mode: batchedConstructionMode,
      }),
    ).toThrow(/distinct immutable binding/u);
    expect(() =>
      v.parse(sdcpnInitialDataSchema, {
        mode: "unrestricted-construction",
      }),
    ).toThrow(/Invalid type/u);
  });

  test("restricts issued browser binding to the opt-in prepared mode", () => {
    const browser = {
      binding: {
        conversationId: "conversation",
        documentId: "document",
        incarnationId: "incarnation",
      },
      requestedBaseHash: "a".repeat(64),
    };
    expect(
      v.parse(sdcpnInitialDataSchema, {
        mode: validatedFixtureMutationMode,
        browser,
      }),
    ).toEqual({ mode: validatedFixtureMutationMode, browser });
    expect(() =>
      v.parse(sdcpnInitialDataSchema, {
        mode: VALIDATED_CONSTRUCTION_MODE,
        browser,
      }),
    ).toThrow(/prepared root-arc/u);
  });

  test("exposes exactly the bounded canonical subset", () => {
    expect(petrinautConstructionTools.map((tool) => tool.name)).toEqual([
      ...PETRINAUT_CONSTRUCTION_TOOL_NAMES,
    ]);
  });

  test("limits prepared fixtures to one canonical read and arc mutation", () => {
    expect(petrinautFixtureTools.map((tool) => tool.name)).toEqual([
      ...petrinautFixtureToolNames,
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

  test("delegates accepted and rejected inputs to Petrinaut's Zod schemas", async () => {
    const addArc = toolByName("addArc");
    const invalidArc = {
      transitionId: "transition",
      arcDirection: "input",
      placeId: "place",
      weight: 0,
      targetSubnetId: null,
    };
    const validArc = { ...invalidArc, weight: 1 };

    expect(
      !(await addArc.input!["~standard"].validate(invalidArc)).issues,
    ).toBe(petrinautAiTools.addArc.inputSchema.safeParse(invalidArc).success);
    expect(!(await addArc.input!["~standard"].validate(validArc)).issues).toBe(
      petrinautAiTools.addArc.inputSchema.safeParse(validArc).success,
    );
  });

  test("normalizes a finite provider numeric-string arc weight", async () => {
    const addArc = toolByName("addArc");
    const result = await addArc.input!["~standard"].validate({
      transitionId: "transition",
      arcDirection: "input",
      placeId: "place",
      weight: "1",
      type: "standard",
    });

    expect(result).toMatchObject({ value: { weight: 1 } });
  });

  test("retains nested values in canonical validation paths", async () => {
    const addType = toolByName("addType");
    const invalidElement = {
      elementId: "speed",
      name: "speed",
      type: "not-a-type",
    };
    const invalidType = {
      id: "vehicle",
      name: "Vehicle",
      iconSlug: "circle",
      displayColor: "#808080",
      elements: [invalidElement],
    };
    const result = await addType.input!["~standard"].validate(invalidType);
    if (!result.issues) throw new Error("Expected nested type rejection");

    expect(result.issues[0]?.path).toEqual(["elements", 0, "type"]);
  });
});
