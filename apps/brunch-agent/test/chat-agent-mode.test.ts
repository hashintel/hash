import * as v from "valibot";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { brunchModes, brunchTools } from "@hashintel/brunch-agent";
import { sdcpnInitialDataSchema } from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  petrinautAiCapabilityGuidance,
  petrinautAiTools,
} from "@hashintel/petrinaut-core/ai";

import {
  assertPetrinautToolCatalogueConformance,
  canonicalPetrinautToolCatalogue,
  toolCatalogueByMode,
} from "../src/agents/chat-agent/tool-catalogue.ts";

const mounted = vi.hoisted(() => ({
  initialData: undefined as unknown,
  contextProjections: 0,
  instructions: [] as string[],
  models: [] as string[],
  skills: [] as string[],
  tools: [] as string[],
}));
vi.mock("@flue/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flue/runtime")>()),
  useContextProjection: () => {
    mounted.contextProjections += 1;
  },
  useInitialData: () => mounted.initialData,
  useInstruction: (instruction: string) =>
    mounted.instructions.push(instruction),
  useModel: (model: string) => mounted.models.push(model),
  usePersistentState: (_key: string, initialValue: unknown) => [
    initialValue,
    vi.fn<(value: unknown) => void>(),
  ],
  useSkill: (skill: { name: string }) => mounted.skills.push(skill.name),
  useTool: (tool: { name: string }) => mounted.tools.push(tool.name),
}));
// Only the Flue build packages skills; these tests exercise the composition around them.
vi.mock("@hashintel/brunch-agent/skills/elicitation/SKILL.md", () => ({
  default: { name: "elicitation" },
}));
vi.mock(
  "@hashintel/brunch-agent-plugin-sdcpn/skills/sdcpn-modelling/SKILL.md",
  () => ({ default: { name: "sdcpn-modelling" } }),
);
const construction = {
  binding: {
    conversationId: "conversation",
    documentId: "document",
    incarnationId: "incarnation",
  },
};
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("BRUNCH_CHAT_MODEL", "claude-sonnet-4-6");
  vi.stubEnv("NODE_ENV", "test");
  mounted.initialData = undefined;
  mounted.contextProjections = 0;
  mounted.instructions.length = 0;
  mounted.models.length = 0;
  mounted.skills.length = 0;
  mounted.tools.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

test("I mounts the complete canonical catalogue plus Brunch workpiece and draft", async () => {
  mounted.initialData = { mode: brunchModes.integrated, construction };
  const { ChatAgent: renderChatAgent } =
    await import("../src/agents/chat-agent/agent.ts");
  expect(renderChatAgent({ id: "integrated" })).toContain("Ledger");
  expect(mounted.contextProjections).toBe(1);
  expect(mounted.tools).toEqual(
    expect.arrayContaining([
      "mutate_workpiece",
      "read_workpiece",
      "query_workpiece",
      brunchTools.draftPetrinautExperiment,
      ...Object.keys(petrinautAiTools),
    ]),
  );
  expect(mounted.skills).toEqual(
    expect.arrayContaining(["elicitation", "sdcpn-modelling"]),
  );
  expect(mounted.instructions).toContain(petrinautAiCapabilityGuidance);
});

test("a no-mode conversation mounts the SDCPN skill without browser tools", async () => {
  const { ChatAgent: renderChatAgent } =
    await import("../src/agents/chat-agent/agent.ts");
  renderChatAgent({ id: "no-mode" });
  expect(mounted.skills).toContain("sdcpn-modelling");
  expect(mounted.tools).not.toContain(brunchTools.draftPetrinautExperiment);
  expect(mounted.tools).not.toContain("readPetrinautDoc");
  expect(mounted.instructions).toEqual(
    expect.arrayContaining([
      expect.stringContaining("This conversation has no browser tools"),
    ]),
  );
});

test("only integrated mode is admitted with immutable document bindings", () => {
  expect(
    v.parse(sdcpnInitialDataSchema, {
      mode: brunchModes.integrated,
      construction,
    }),
  ).toEqual({
    mode: brunchModes.integrated,
    construction,
  });
  expect(
    v.safeParse(sdcpnInitialDataSchema, { mode: brunchModes.integrated })
      .success,
  ).toBe(false);
});

test("the integrated catalogue classifies every canonical tool", () => {
  const canonicalNames = Object.keys(petrinautAiTools);
  expect(canonicalPetrinautToolCatalogue.map(({ name }) => name)).toEqual(
    canonicalNames,
  );
  expect(
    toolCatalogueByMode[brunchModes.integrated].map(({ name }) => name),
  ).toEqual(expect.arrayContaining(canonicalNames));
  expect(
    toolCatalogueByMode[brunchModes.integrated].map(({ name }) => name),
  ).toContain(brunchTools.draftPetrinautExperiment);
  expect(() =>
    assertPetrinautToolCatalogueConformance([
      ...canonicalNames,
      "newCanonicalStockTool",
    ]),
  ).toThrow(/unclassified/u);
});
