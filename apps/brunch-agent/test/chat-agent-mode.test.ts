import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { petrinautAiPrompt } from "@hashintel/petrinaut-core";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

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
  useAgentStart: () => undefined,
  useContextProjection: () => {
    mounted.contextProjections += 1;
  },
  useDelivery: () => ({ kind: "user", body: "test" }),
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

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("BRUNCH_CHAT_MODEL", "claude-sonnet-4-6");
  vi.stubEnv("BRUNCH_TEST_KEEP_RECENT_TOKENS", undefined);
  vi.stubEnv("NODE_ENV", "test");
  mounted.initialData = undefined;
  mounted.contextProjections = 0;
  mounted.instructions.length = 0;
  mounted.models.length = 0;
  mounted.skills.length = 0;
  mounted.tools.length = 0;
});

afterEach(() => vi.unstubAllEnvs());

test("canonical mode returns only the stock prompt and mounts only canonical Petrinaut contributions", async () => {
  mounted.initialData = {
    mode: "canonical-petrinaut-tools",
    construction: {
      binding: {
        conversationId: "conversation",
        documentId: "document",
        incarnationId: "incarnation",
      },
    },
  };
  const { ChatAgent: renderChatAgent } =
    await import("../src/agents/chat-agent/agent.ts");

  expect(renderChatAgent({ id: "canonical-instance" })).toBe(petrinautAiPrompt);
  expect(mounted.models).toEqual(["anthropic/claude-sonnet-4-6"]);
  expect(mounted.contextProjections).toBe(0);
  expect(mounted.tools).toEqual(Object.keys(petrinautAiTools));
  expect(mounted.tools).not.toContain("mutate_workpiece");
  expect(mounted.skills).toEqual([]);
  expect(mounted.instructions.join("\n")).not.toMatch(
    /Ledger|read_petrinaut_net|brunch\.net-stale/u,
  );
});

test("legacy mode retains the Brunch prompt, elicitation skill, and Ledger tool", async () => {
  const { ChatAgent: renderChatAgent } =
    await import("../src/agents/chat-agent/agent.ts");

  const prompt = renderChatAgent({ id: "legacy-instance" });
  expect(prompt).not.toBe(petrinautAiPrompt);
  expect(prompt).toContain("Ledger");
  expect(mounted.models).toEqual(["anthropic/claude-sonnet-4-6"]);
  expect(mounted.contextProjections).toBe(1);
  expect(mounted.skills).toContain("elicitation");
  expect(mounted.tools).toContain("mutate_workpiece");
  expect(mounted.instructions.join("\n")).toContain("read_petrinaut_net");
});
