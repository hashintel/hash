import * as v from "valibot";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { brunchModes, brunchTools } from "@hashintel/brunch-agent";
import { sdcpnInitialDataSchema } from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  petrinautAiCapabilityGuidance,
  petrinautAiPrompt,
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

test("F preserves Stock's exact prompt and catalogue without Brunch contributions", async () => {
  mounted.initialData = { mode: brunchModes.stockOverFlue, construction };
  const { ChatAgent: renderChatAgent } =
    await import("../src/agents/chat-agent/agent.ts");
  expect(renderChatAgent({ id: "stock-control" })).toBe(petrinautAiPrompt);
  expect(mounted.contextProjections).toBe(0);
  expect(mounted.tools).toEqual(Object.keys(petrinautAiTools));
  expect(mounted.skills).toEqual([]);
  expect(mounted.instructions).toEqual([]);
});

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

test("only F and I are admitted with immutable document bindings", () => {
  for (const mode of [brunchModes.stockOverFlue, brunchModes.integrated])
    expect(v.parse(sdcpnInitialDataSchema, { mode, construction })).toEqual({
      mode,
      construction,
    });
  expect(
    v.safeParse(sdcpnInitialDataSchema, { mode: brunchModes.integrated })
      .success,
  ).toBe(false);
});

test("catalogues classify every canonical tool for F/I", () => {
  const canonicalNames = Object.keys(petrinautAiTools);
  expect(canonicalPetrinautToolCatalogue.map(({ name }) => name)).toEqual(
    canonicalNames,
  );
  expect(toolCatalogueByMode[brunchModes.stockOverFlue]).toEqual(
    canonicalPetrinautToolCatalogue,
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
