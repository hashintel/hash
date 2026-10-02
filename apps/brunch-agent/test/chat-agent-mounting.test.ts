import * as v from "valibot";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";
import {
  interviewBudgetContextKey,
  sdcpnInitialDataSchema,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { petrinautContextualUserMessageBody } from "@hashintel/brunch-agent-transport-aisdk";
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
  body: "Four agents",
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
  useDelivery: () => ({ kind: "user", body: mounted.body }),
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
  mounted.body = "Four agents";
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

test("only the current submission's budget reaches the prompt and Off or a malformed budget restores exactly the baseline", async () => {
  mounted.initialData = bound;
  const { ChatAgent: renderChatAgent } =
    await import("../src/agents/chat-agent/agent.ts");
  const baseline = renderChatAgent({ id: "budget" });
  const baselineInstructions = [...mounted.instructions];
  mounted.initialData = {
    ...bound,
    interviewBudget: {
      level: "standard",
      questionCap: 6,
      asked: 0,
      remaining: 6,
    },
  };
  for (const remaining of [1, 0]) {
    mounted.instructions.length = 0;
    mounted.body = petrinautContextualUserMessageBody({
      userText: "Four agents",
      diagnosticsContext: "",
      submissionContext: {
        [interviewBudgetContextKey]: {
          level: "quick",
          questionCap: 3,
          asked: 3 - remaining,
          remaining,
        },
      },
    });
    expect(renderChatAgent({ id: "budget" })).toBe(baseline);
    const budgetInstructions = mounted.instructions.filter(
      (instruction) => !baselineInstructions.includes(instruction),
    );
    expect(budgetInstructions).toHaveLength(1);
    expect(budgetInstructions[0]).toContain(`remaining: ${remaining}`);
    expect(budgetInstructions[0]).toContain(
      remaining
        ? "most consequential open fact"
        : "do not ask another question",
    );
  }
  mounted.instructions.length = 0;
  mounted.body = "Four agents";
  expect(renderChatAgent({ id: "budget" })).toBe(baseline);
  expect(mounted.instructions).toEqual(baselineInstructions);
  mounted.instructions.length = 0;
  mounted.body = petrinautContextualUserMessageBody({
    userText: "Four agents",
    diagnosticsContext: "",
    submissionContext: {
      [interviewBudgetContextKey]: { level: "quick", asked: -1 },
    },
  });
  expect(renderChatAgent({ id: "budget" })).toBe(baseline);
  expect(mounted.instructions).toEqual(baselineInstructions);
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
