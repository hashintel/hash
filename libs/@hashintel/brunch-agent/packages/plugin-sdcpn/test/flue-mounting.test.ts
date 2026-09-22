import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, test, vi } from "vitest";

import { petrinautAiCapabilityGuidance } from "@hashintel/petrinaut-core/ai";

const mounting = vi.hoisted(() => ({
  initialData: undefined as unknown,
  instructions: [] as string[],
  skills: [] as unknown[],
  tools: [] as unknown[],
}));

vi.mock("@flue/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flue/runtime")>()),
  useInitialData: () => mounting.initialData,
  useInstruction: (instruction: string) =>
    mounting.instructions.push(instruction),
  useSkill: (skill: unknown) => mounting.skills.push(skill),
  useTool: (tool: unknown) => mounting.tools.push(tool),
}));

import {
  BRUNCH_DECLARED_PROJECTION_MODE,
  BRUNCH_DEEP_CONSTRUCTION_MODE,
  INTEGRATED_BRUNCH_MODE,
  STOCK_OVER_FLUE_MODE,
  batchedConstructionMode,
  canonicalPetrinautTools,
  readPetrinautDocs,
  useSdcpnPlugin,
} from "../src/flue";
import { sdcpnModellingSkill } from "../src/skills/sdcpn-modelling/skill";

const pluginAppend = readFileSync(
  new URL("../src/prompts/APPEND_SYSTEM.md", import.meta.url),
  "utf8",
).trim();

beforeEach(() => {
  mounting.initialData = undefined;
  mounting.instructions.length = 0;
  mounting.skills.length = 0;
  mounting.tools.length = 0;
});

describe("SDCPN prompt and tool mounting", () => {
  test("Stock-over-Flue mounts the canonical catalogue without plugin prompt or skill contributions", () => {
    mounting.initialData = { mode: STOCK_OVER_FLUE_MODE };

    useSdcpnPlugin();

    expect(mounting.instructions).toEqual([]);
    expect(mounting.skills).toEqual([]);
    expect(mounting.tools).toEqual(canonicalPetrinautTools);
  });

  test.each([
    INTEGRATED_BRUNCH_MODE,
    BRUNCH_DECLARED_PROJECTION_MODE,
    BRUNCH_DEEP_CONSTRUCTION_MODE,
  ])(
    "%s inherits the integrated prompt, skill, guidance, and canonical catalogue",
    (mode) => {
      mounting.initialData = { mode };

      useSdcpnPlugin();

      expect(mounting.instructions).toEqual([
        pluginAppend,
        petrinautAiCapabilityGuidance,
      ]);
      expect(mounting.skills).toEqual([sdcpnModellingSkill]);
      expect(mounting.tools).toEqual(canonicalPetrinautTools);
      expect(mounting.tools).not.toContain(readPetrinautDocs);
    },
  );

  test("the retained batched mode keeps its plugin append, skill, and custom choreography", () => {
    mounting.initialData = {
      mode: batchedConstructionMode,
      construction: {
        binding: {
          conversationId: "conversation",
          documentId: "document",
          incarnationId: "incarnation",
        },
      },
    };

    useSdcpnPlugin({
      currentRevision: null,
      retainedRevisionFor: async () => undefined,
      observationFor: async () => undefined as never,
    });

    expect(mounting.instructions[0]).toBe(pluginAppend);
    expect(mounting.skills).toContain(sdcpnModellingSkill);
    expect(mounting.tools).toContain(readPetrinautDocs);
    expect(mounting.instructions.join("\n")).toContain(
      "Construction uses strictly separate proposals.",
    );
  });
});
