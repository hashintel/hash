import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { useBrunchAgent } from "@hashintel/brunch-agent/agent";

const initialData = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock("@hashintel/brunch-agent/agent", () => ({
  useBrunchAgent: vi.fn<typeof useBrunchAgent>(() => "core prompt"),
}));
vi.mock("@hashintel/brunch-agent-plugin-sdcpn/agent", () => ({
  useSdcpnPlugin: () => undefined,
  SDCPN_MODELLING_SKILL_NAME: "sdcpn-modelling",
}));
vi.mock("@flue/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flue/runtime")>()),
  useInstruction: () => undefined,
  useModel: () => undefined,
  useContextProjection: () => undefined,
  useInitialData: () => initialData.value,
  useTool: () => undefined,
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  initialData.value = undefined;
  vi.stubEnv("BRUNCH_CHAT_MODEL", "claude-sonnet-4-6");
  vi.stubEnv("BRUNCH_TEST_KEEP_RECENT_TOKENS", undefined);
  vi.stubEnv("NODE_ENV", "test");
});
afterEach(() => vi.unstubAllEnvs());

test("the ChatAgent passes its local compaction configuration to Brunch", async () => {
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

test("the ChatAgent supplies no compaction override when unset", async () => {
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
