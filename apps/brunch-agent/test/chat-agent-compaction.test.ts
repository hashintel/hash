import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { useBrunchAgent } from "@hashintel/brunch-agent/flue";

vi.mock("@hashintel/brunch-agent/flue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@hashintel/brunch-agent/flue")>()),
  useBrunchAgent: vi.fn<typeof useBrunchAgent>(() => "core prompt"),
}));
vi.mock(
  "@hashintel/brunch-agent-plugin-sdcpn/flue",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@hashintel/brunch-agent-plugin-sdcpn/flue")
    >()),
    useSdcpnPlugin: () => undefined,
    SDCPN_MODELLING_SKILL_NAME: "sdcpn-modelling",
    sdcpnInitialDataSchema: undefined,
  }),
);
vi.mock("@flue/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flue/runtime")>()),
  useInstruction: () => undefined,
  useInitialData: () => undefined,
  useDelivery: () => ({ kind: "user", body: "test" }),
  useAgentStart: () => undefined,
  useTool: () => undefined,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
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
    { keepRecentTokens: 256 },
    expect.any(Function),
  );
  expect(renderChatAgent.agentName).toBe("brunch-chat-agent");
});

test("the production ChatAgent supplies no compaction override when unset", async () => {
  const { ChatAgent: renderChatAgent } =
    await import("../src/agents/chat-agent/agent.ts");
  renderChatAgent({ id: "test-instance" });
  expect(useBrunchAgent).toHaveBeenCalledExactlyOnceWith(
    "anthropic/claude-sonnet-4-6",
    undefined,
    expect.any(Function),
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
