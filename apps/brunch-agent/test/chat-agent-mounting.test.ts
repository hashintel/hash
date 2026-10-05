import * as v from "valibot";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";
import { sdcpnInitialDataSchema } from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  petrinautAiCapabilityGuidance,
  petrinautAiTools,
} from "@hashintel/petrinaut-core/ai";

import {
  assertPetrinautToolCatalogueConformance,
  canonicalPetrinautToolCatalogue,
  brunchToolCatalogue,
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
const bound = {
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

test("a document binding mounts the complete canonical catalogue plus Brunch workpiece and draft", async () => {
  mounted.initialData = bound;
  const { ChatAgent: renderChatAgent } =
    await import("../src/agents/chat-agent/agent.ts");
  expect(renderChatAgent({ id: "bound" })).toContain("Ledger");
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

test("a conversation without initial data mounts the SDCPN skill without browser tools", async () => {
  const { ChatAgent: renderChatAgent } =
    await import("../src/agents/chat-agent/agent.ts");
  renderChatAgent({ id: "unbound" });
  expect(mounted.skills).toContain("sdcpn-modelling");
  expect(mounted.tools).not.toContain(brunchTools.draftPetrinautExperiment);
  expect(mounted.tools).not.toContain("readPetrinautDoc");
  expect(mounted.instructions).toEqual(
    expect.arrayContaining([
      expect.stringContaining("This conversation has no browser tools"),
    ]),
  );
});

test("the agent admits a document binding or no initial data", () => {
  expect(v.parse(sdcpnInitialDataSchema, bound)).toEqual(bound);
  expect(v.parse(sdcpnInitialDataSchema, undefined)).toBeUndefined();
});

test("the Brunch catalogue classifies every canonical tool", () => {
  const canonicalNames = Object.keys(petrinautAiTools);
  expect(canonicalPetrinautToolCatalogue.map(({ name }) => name)).toEqual(
    canonicalNames,
  );
  expect(brunchToolCatalogue.map(({ name }) => name)).toEqual(
    expect.arrayContaining(canonicalNames),
  );
  expect(brunchToolCatalogue.map(({ name }) => name)).toContain(
    brunchTools.draftPetrinautExperiment,
  );
  expect(() =>
    assertPetrinautToolCatalogueConformance([
      ...canonicalNames,
      "newCanonicalStockTool",
    ]),
  ).toThrow(/unclassified/u);
});
