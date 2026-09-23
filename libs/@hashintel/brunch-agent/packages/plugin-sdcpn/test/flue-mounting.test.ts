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
  applyPetrinautConstructionToolName,
  batchedConstructionMode,
  canonicalPetrinautTools,
  declarePetrinautProjectionToolName,
  draftPetrinautExperimentToolName,
  readPetrinautDocs,
  useSdcpnPlugin,
} from "../src/flue";
import { sdcpnModellingSkill } from "../src/skills/sdcpn-modelling/skill";

const pluginAppend = readFileSync(
  new URL("../src/prompts/APPEND_SYSTEM.md", import.meta.url),
  "utf8",
).trim();
const binding = Object.freeze({
  conversationId: "conversation",
  documentId: "document",
  incarnationId: "incarnation",
});
const integratedOptions = () => ({
  currentRevision: null,
  retainedRevisionFor: async () => undefined,
  authorizeDraft: async () => {
    throw new Error("Mounting must not authorize a draft");
  },
});
const draftPolicy = expect.stringContaining(
  "prefer draft_petrinaut_experiment after a verified canonical getLatestNetDefinition read",
);
const canonicalNames = canonicalPetrinautTools.map(({ name }) => name);

beforeEach(() => {
  mounting.initialData = undefined;
  mounting.instructions.length = 0;
  mounting.skills.length = 0;
  mounting.tools.length = 0;
});

describe("SDCPN prompt and tool mounting", () => {
  test("Stock-over-Flue mounts the canonical catalogue without plugin prompt or skill contributions", () => {
    mounting.initialData = {
      mode: STOCK_OVER_FLUE_MODE,
      construction: { binding },
    };

    useSdcpnPlugin();

    expect(mounting.instructions).toEqual([]);
    expect(mounting.skills).toEqual([]);
    expect(mounting.tools).toEqual(canonicalPetrinautTools);
    expect(canonicalNames).toContain("createExperiment");
    expect(mounting.tools).not.toContainEqual(
      expect.objectContaining({ name: draftPetrinautExperimentToolName }),
    );
  });

  test("integrated mode inherits the prompt, skill, guidance, and canonical catalogue", () => {
    mounting.initialData = {
      mode: INTEGRATED_BRUNCH_MODE,
      construction: { binding },
    };

    useSdcpnPlugin(integratedOptions());

    expect(mounting.instructions).toEqual([
      pluginAppend,
      petrinautAiCapabilityGuidance,
      draftPolicy,
    ]);
    expect(mounting.skills).toEqual([sdcpnModellingSkill]);
    expect(
      mounting.tools.map((tool) => (tool as { name: string }).name),
    ).toEqual([draftPetrinautExperimentToolName, ...canonicalNames]);
    expect(canonicalNames).toContain("createExperiment");
    expect(mounting.tools).not.toContain(readPetrinautDocs);
  });

  test("deep construction alone adds Interface B after the complete canonical catalogue", () => {
    mounting.initialData = {
      mode: BRUNCH_DEEP_CONSTRUCTION_MODE,
      construction: { binding },
    };

    useSdcpnPlugin(integratedOptions());

    expect(
      mounting.tools.map((tool) => (tool as { name: string }).name),
    ).toEqual([
      draftPetrinautExperimentToolName,
      ...canonicalNames,
      applyPetrinautConstructionToolName,
    ]);
    expect(canonicalNames).toContain("createExperiment");
    expect(mounting.instructions).toEqual([
      pluginAppend,
      petrinautAiCapabilityGuidance,
      draftPolicy,
      expect.stringContaining("use apply_petrinaut_construction"),
    ]);
    expect(mounting.instructions[3]).toContain("fine-grained corrections");
  });

  test("declared projection mounts one server declaration before the canonical catalogue", () => {
    mounting.initialData = {
      mode: BRUNCH_DECLARED_PROJECTION_MODE,
      construction: { binding },
    };

    useSdcpnPlugin(integratedOptions());

    expect(
      mounting.tools.map((tool) => (tool as { name: string }).name),
    ).toEqual([
      draftPetrinautExperimentToolName,
      declarePetrinautProjectionToolName,
      ...canonicalNames,
    ]);
    expect(canonicalNames).toContain("createExperiment");
    expect(mounting.instructions).toEqual([
      pluginAppend,
      petrinautAiCapabilityGuidance,
      draftPolicy,
      expect.stringContaining("call declare_petrinaut_projection"),
    ]);
    expect(mounting.instructions[3]).toContain("declaration order");
  });

  test("the retained batched mode keeps its plugin append, skill, and custom choreography", () => {
    mounting.initialData = {
      mode: batchedConstructionMode,
      construction: { binding },
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
