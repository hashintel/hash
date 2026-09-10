import * as v from "valibot";
import { describe, expect, test, vi } from "vitest";

import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import type { DeliveredMessage } from "@flue/runtime";

const pluginRender = vi.hoisted(() => ({
  delivery: { kind: "user", body: "" } as unknown,
  initialData: undefined as unknown,
  toolNames: [] as string[],
}));

vi.mock("@flue/runtime", async (importOriginal) => {
  const runtime = await importOriginal<typeof import("@flue/runtime")>();
  return {
    ...runtime,
    useDelivery: () => pluginRender.delivery,
    useInitialData: () => pluginRender.initialData,
    useInstruction: () => {},
    useSkill: () => {},
    useTool: (tool: { readonly name: string }) => {
      pluginRender.toolNames.push(tool.name);
    },
  };
});

import {
  sdcpnInitialDataSchema,
  useSdcpnPlugin,
  VALIDATED_CONSTRUCTION_MODE,
  validatedFixtureMutationMode,
  petrinautFixtureTools as publicPetrinautFixtureTools,
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

const mountedToolNamesFor = (delivery: DeliveredMessage): readonly string[] => {
  pluginRender.delivery = delivery;
  pluginRender.initialData = undefined;
  pluginRender.toolNames = [];
  useSdcpnPlugin();
  return pluginRender.toolNames;
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
    expect(() =>
      v.parse(sdcpnInitialDataSchema, {
        mode: "unrestricted-construction",
      }),
    ).toThrow(/Invalid type/u);
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

  test("re-exports prepared-fixture tools from the public Flue entrypoint", () => {
    expect(publicPetrinautFixtureTools.map((tool) => tool.name)).toEqual([
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

  test("delegates accepted and rejected inputs to Petrinaut's Zod schemas", () => {
    const addArc = toolByName("addArc");
    const invalidArc = {
      transitionId: "transition",
      arcDirection: "input",
      placeId: "place",
      weight: 0,
      targetSubnetId: null,
    };
    const validArc = { ...invalidArc, weight: 1 };

    expect(v.safeParse(addArc.input!, invalidArc).success).toBe(
      petrinautAiTools.addArc.inputSchema.safeParse(invalidArc).success,
    );
    expect(v.safeParse(addArc.input!, validArc).success).toBe(
      petrinautAiTools.addArc.inputSchema.safeParse(validArc).success,
    );
  });

  test("normalizes a finite provider numeric-string arc weight", () => {
    const addArc = toolByName("addArc");
    const result = v.parse(addArc.input!, {
      transitionId: "transition",
      arcDirection: "input",
      placeId: "place",
      weight: "1",
      type: "standard",
    });

    expect(result).toMatchObject({ weight: 1 });
  });

  test("retains nested values in canonical validation paths", () => {
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
    const result = v.safeParse(addType.input!, invalidType);
    if (result.success) throw new Error("Expected nested type rejection");

    expect(result.issues[0].path).toMatchObject([
      { input: invalidType, key: "elements", value: invalidType.elements },
      { input: invalidType.elements, key: 0, value: invalidElement },
      { input: invalidElement, key: "type", value: "not-a-type" },
    ]);
  });
});

describe("SDCPN plugin tool exposure", () => {
  test("keeps the current-net reader after a different client tool result", () => {
    const mountedToolNames = mountedToolNamesFor({
      kind: "signal",
      type: "client-tool-result",
      tagName: "client-tool-result",
      body: JSON.stringify([
        {
          toolCallId: "tool-doc-1",
          toolName: "readPetrinautDoc",
          output: "# AI Assistant",
        },
      ]),
    });

    expect(mountedToolNames).toContain("getLatestNetDefinition");
    expect(mountedToolNames).not.toContain("addArc");
  });

  test("unmounts the current-net reader after its result", () => {
    const mountedToolNames = mountedToolNamesFor({
      kind: "signal",
      type: "client-tool-result",
      tagName: "client-tool-result",
      body: JSON.stringify([
        {
          toolCallId: "tool-current-net-1",
          toolName: "getLatestNetDefinition",
          output: { title: "Current net" },
        },
      ]),
    });

    expect(mountedToolNames).not.toContain("getLatestNetDefinition");
  });
});
