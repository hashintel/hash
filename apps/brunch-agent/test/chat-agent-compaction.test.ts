import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { useBrunchAgent } from "@hashintel/brunch-agent/agent";

const useInstruction = vi.hoisted(() => vi.fn<(instruction: string) => void>());
const initialData = vi.hoisted(() => ({ value: undefined as unknown }));
type AgentStartHook = (context: {
  append: (message: unknown) => void;
}) => Promise<void>;
const agentStart = vi.hoisted(() => ({
  hook: undefined as AgentStartHook | undefined,
}));
const deriveNetFreshness = vi.hoisted(() =>
  vi.fn<() => Promise<{ kind: "never-read" }>>(async () => ({
    kind: "never-read",
  })),
);

vi.mock("../src/conversation/net-freshness.ts", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../src/conversation/net-freshness.ts")
  >()),
  deriveNetFreshness,
}));
vi.mock("@flue/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flue/sdk")>()),
  createFlueClient: () => ({ history: async () => ({ messages: [] }) }),
}));

vi.mock("@hashintel/brunch-agent/agent", () => ({
  useBrunchAgent: vi.fn<typeof useBrunchAgent>(() => "core prompt"),
}));
vi.mock("@hashintel/brunch-agent-plugin-sdcpn/agent", () => ({
  useSdcpnPlugin: () => undefined,
  SDCPN_MODELLING_SKILL_NAME: "sdcpn-modelling",
}));
vi.mock(
  "@hashintel/brunch-agent-plugin-sdcpn/flue",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@hashintel/brunch-agent-plugin-sdcpn/flue")
    >()),
    sdcpnInitialDataSchema: undefined,
  }),
);
vi.mock("@flue/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flue/runtime")>()),
  useInstruction,
  useModel: () => undefined,
  useContextProjection: () => undefined,
  useInitialData: () => initialData.value,
  useDelivery: () => ({ kind: "user", body: "test" }),
  useAgentStart: (hook: AgentStartHook) => {
    agentStart.hook = hook;
  },
  useTool: () => undefined,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  initialData.value = undefined;
  agentStart.hook = undefined;
  vi.stubEnv("BRUNCH_CHAT_MODEL", "claude-sonnet-4-6");
  vi.stubEnv("BRUNCH_TEST_KEEP_RECENT_TOKENS", undefined);
  vi.stubEnv("NODE_ENV", "test");
});
afterEach(() => vi.unstubAllEnvs());

test("the production ChatAgent passes the local configuration to its core hook", async () => {
  vi.stubEnv("BRUNCH_TEST_KEEP_RECENT_TOKENS", "256");
  const { ChatAgent: renderChatAgent } =
    await import("../src/agents/chat-agent/agent.ts");
  expect(renderChatAgent({ id: "test-instance" })).toBe("core prompt");
  expect(useBrunchAgent).toHaveBeenCalledExactlyOnceWith(
    "anthropic/claude-sonnet-4-6",
    { thinkingLevel: "xhigh", compaction: { keepRecentTokens: 256 } },
    expect.any(Function),
    undefined,
    false,
  );
  expect(renderChatAgent.agentName).toBe("brunch-chat-agent");
});

test("the production ChatAgent supplies no compaction override when unset", async () => {
  const { ChatAgent: renderChatAgent } =
    await import("../src/agents/chat-agent/agent.ts");
  renderChatAgent({ id: "test-instance" });
  expect(useBrunchAgent).toHaveBeenCalledExactlyOnceWith(
    "anthropic/claude-sonnet-4-6",
    { thinkingLevel: "xhigh" },
    expect.any(Function),
    undefined,
    false,
  );
});

test("browser calls stay separate from server tools without a one-call limit", async () => {
  const { ChatAgent: renderChatAgent } =
    await import("../src/agents/chat-agent/agent.ts");
  renderChatAgent({ id: "test-instance" });

  const transportInstruction = useInstruction.mock.calls
    .map(([instruction]) => instruction as string)
    .find((instruction) => instruction.includes("Invalid proposals fail"));
  expect(transportInstruction).toContain(
    "Submit browser tool calls separately from server tools",
  );
  expect(transportInstruction).toContain(
    "wait for their correlated client results",
  );
  expect(transportInstruction).not.toContain(
    "at most one browser tool call per proposal",
  );
});

test("canonical mode omits the old freshness and why instructions while batched mode retains them", async () => {
  initialData.value = { mode: "canonical-petrinaut-tools" };
  const { ChatAgent: renderCanonicalAgent } =
    await import("../src/agents/chat-agent/agent.ts");
  renderCanonicalAgent({ id: "canonical-instance" });

  const canonicalInstructions = useInstruction.mock.calls
    .map(([instruction]) => instruction)
    .join("\n");
  expect(canonicalInstructions).not.toContain("read_petrinaut_net");
  expect(canonicalInstructions).not.toContain("brunch.net-stale");
  expect(canonicalInstructions).not.toContain("query_workpiece");

  vi.resetModules();
  vi.clearAllMocks();
  initialData.value = {
    mode: "batched-construction",
    construction: {
      binding: {
        conversationId: "conversation",
        documentId: "document",
        incarnationId: "incarnation",
      },
    },
  };
  const { ChatAgent: renderBatchedAgent } =
    await import("../src/agents/chat-agent/agent.ts");
  renderBatchedAgent({ id: "batched-instance" });

  const batchedInstructions = useInstruction.mock.calls
    .map(([instruction]) => instruction)
    .join("\n");
  expect(batchedInstructions).toContain("read_petrinaut_net");
  expect(batchedInstructions).toContain("brunch.net-stale");
  expect(batchedInstructions).toContain("query_workpiece");
});

const constructionBinding = {
  conversationId: "conversation",
  documentId: "document",
  incarnationId: "incarnation",
};

const renderForMode = async (mode: string) => {
  initialData.value = { mode, construction: { binding: constructionBinding } };
  const { ChatAgent: renderChatAgent } =
    await import("../src/agents/chat-agent/agent.ts");
  renderChatAgent({ id: `${mode}-instance` });
  const appended: unknown[] = [];
  await agentStart.hook?.({ append: (message) => appended.push(message) });
  return {
    appended,
    instructions: useInstruction.mock.calls
      .map(([instruction]) => instruction)
      .join("\n"),
  };
};

test("I suspends the terminal-protocol stale-net marker and its instructions", async () => {
  const { appended, instructions } = await renderForMode(
    "integrated-brunch-canonical",
  );

  expect(deriveNetFreshness).not.toHaveBeenCalled();
  expect(appended).toEqual([]);
  expect(instructions).not.toContain("brunch.net-stale");
  expect(instructions).not.toContain("then ends");
  expect(instructions).not.toContain("use later turns");
  expect(instructions).toContain("continue the task after each result");
  expect(instructions).toContain(
    "call getLatestNetDefinition first, then call query_workpiece after its result returns",
  );
});

test("A keeps the stale-net marker for its terminal browser-tool protocol", async () => {
  const { appended, instructions } = await renderForMode(
    "brunch-declared-projection",
  );

  expect(deriveNetFreshness).toHaveBeenCalledOnce();
  expect(appended).toEqual([
    expect.objectContaining({
      kind: "signal",
      type: "brunch.net-stale",
      attributes: { kind: "never-read" },
    }),
  ]);
  expect(instructions).toContain("brunch.net-stale");
  expect(instructions).toContain("then ends");
});

test("the production ChatAgent forwards an independent OpenAI specifier and thinking level", async () => {
  vi.stubEnv("BRUNCH_CHAT_MODEL", "openai/gpt-5.6-sol");
  vi.stubEnv("BRUNCH_CHAT_THINKING", "low");
  const { ChatAgent: renderChatAgent } =
    await import("../src/agents/chat-agent/agent.ts");
  renderChatAgent({ id: "test-instance" });
  expect(useBrunchAgent).toHaveBeenCalledExactlyOnceWith(
    "openai/gpt-5.6-sol",
    { thinkingLevel: "low" },
    expect.any(Function),
    undefined,
    false,
  );
});

test.each([
  { NODE_ENV: "production", BRUNCH_TEST_KEEP_RECENT_TOKENS: "256" },
  { NODE_ENV: "test", BRUNCH_TEST_KEEP_RECENT_TOKENS: "invalid" },
])(
  "rejects forbidden configuration before rendering: %j",
  async (environment) => {
    vi.stubEnv("NODE_ENV", environment.NODE_ENV);
    vi.stubEnv(
      "BRUNCH_TEST_KEEP_RECENT_TOKENS",
      environment.BRUNCH_TEST_KEEP_RECENT_TOKENS,
    );
    await expect(import("../src/agents/chat-agent/agent.ts")).rejects.toThrow(
      /BRUNCH_TEST_KEEP_RECENT_TOKENS/u,
    );
    expect(useBrunchAgent).not.toHaveBeenCalled();
  },
);
