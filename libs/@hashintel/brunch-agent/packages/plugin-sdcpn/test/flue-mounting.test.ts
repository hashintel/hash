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

import { sdcpnModellingSkill, useSdcpnPlugin } from "../src/agent";
import {
  INTEGRATED_BRUNCH_MODE,
  STOCK_OVER_FLUE_MODE,
  canonicalPetrinautTools,
  draftPetrinautExperimentToolName,
  readPetrinautDocs,
} from "../src/flue";

const pluginAppend = readFileSync(
  new URL("../src/prompts/APPEND_SYSTEM.md", import.meta.url),
  "utf8",
).trim();
const binding = {
  conversationId: "conversation",
  documentId: "document",
  incarnationId: "incarnation",
};
const integratedOptions = () => ({
  currentRevision: null,
  retainedRevisionFor: async () => undefined,
  authorizeDraft: async () => ({ revisionId: "revision" }),
});
const canonicalNames = canonicalPetrinautTools.map(({ name }) => name);

beforeEach(() => {
  mounting.initialData = undefined;
  mounting.instructions.length = 0;
  mounting.skills.length = 0;
  mounting.tools.length = 0;
});

describe("SDCPN mode mounting", () => {
  test("F mounts exactly Petrinaut's catalogue without Brunch prompt or skill", () => {
    mounting.initialData = {
      mode: STOCK_OVER_FLUE_MODE,
      construction: { binding },
    };
    useSdcpnPlugin();
    expect(mounting.instructions).toEqual([]);
    expect(mounting.skills).toEqual([]);
    expect(mounting.tools).toEqual(canonicalPetrinautTools);
  });
  test("I mounts Brunch, guidance, draft and the complete canonical catalogue", () => {
    mounting.initialData = {
      mode: INTEGRATED_BRUNCH_MODE,
      construction: { binding },
    };
    useSdcpnPlugin(integratedOptions());
    expect(mounting.instructions).toEqual([
      pluginAppend,
      petrinautAiCapabilityGuidance,
      expect.stringContaining("prefer draft_petrinaut_experiment"),
    ]);
    expect(mounting.skills).toEqual([sdcpnModellingSkill]);
    expect(
      mounting.tools.map((tool) => (tool as { name: string }).name),
    ).toEqual([draftPetrinautExperimentToolName, ...canonicalNames]);
  });
  test("a conversation without a mode retains only the skill and docs tool", () => {
    useSdcpnPlugin();
    expect(mounting.instructions).toEqual([pluginAppend]);
    expect(mounting.skills).toEqual([sdcpnModellingSkill]);
    expect(mounting.tools).toEqual([readPetrinautDocs]);
  });
});
