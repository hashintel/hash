import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type Provider,
} from "@earendil-works/pi-ai";
import { instrument, setProvider } from "@flue/runtime";
import { Hono } from "hono";
import { beforeAll, expect, test, vi } from "vitest";

vi.mock("../src/telemetry-bootstrap.ts", () => ({}));
vi.mock("../src/agents/chat-agent/agent.ts", () => ({
  ChatAgent: { agentName: "brunch-chat-agent" },
}));
vi.mock("@flue/runtime/routing", () => ({
  createAgentRouter: () => new Hono(),
}));
vi.mock("@flue/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flue/runtime")>()),
  instrument: vi.fn<typeof instrument>(),
  setProvider: vi.fn<typeof setProvider>(),
}));
const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: "synthetic" }],
});
vi.mock("@earendil-works/pi-ai/providers/anthropic", () => ({
  anthropicProvider: () => faux.provider,
}));
beforeAll(async () => {
  await import("../src/app");
});

const drain = async (stream: ReturnType<Provider["streamSimple"]>) => {
  for await (const _event of stream) {
    /* Drain the public provider stream. */
  }
  return stream.result();
};

test("app registration classifies mutate_petrinaut_net as a browser tool", async () => {
  const registration = vi
    .mocked(instrument)
    .mock.calls.find(
      ([entry]) => entry.key === Symbol.for("brunch.buffered-tool-admission"),
    )?.[0];
  expect(registration).toBeDefined();
  const provider = vi.mocked(setProvider).mock.calls.at(-1)![0];
  const model = provider.getModels()[0]!;
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall("mutate_workpiece", {}),
        fauxToolCall("mutate_petrinaut_net", {}),
      ],
      { stopReason: "toolUse" },
    ),
  ]);

  await expect(
    registration!.interceptor(
      {
        type: "agent",
        operationId: "mutate-petrinaut-net-classification",
        operationKind: "prompt",
      },
      { agentName: "brunch-chat-agent" },
      async () => drain(provider.streamSimple(model, { messages: [] })),
    ),
  ).rejects.toThrow("Mixed browser/server proposal");
});

test("app registration scopes admission to ChatAgent execution, isolating concurrent agents and delegated tasks", async () => {
  const registration = vi
    .mocked(instrument)
    .mock.calls.find(
      ([entry]) => entry.key === Symbol.for("brunch.buffered-tool-admission"),
    )?.[0];
  expect(registration).toBeDefined();
  const provider = vi.mocked(setProvider).mock.calls.at(-1)![0];
  expect(provider.auth).toBe(faux.provider.auth);
  expect(provider.getModels()).toEqual(faux.provider.getModels());
  const model = provider.getModels()[0]!;
  const response = fauxAssistantMessage(
    [fauxToolCall("mutate_workpiece", {}), fauxToolCall("addType", {})],
    { stopReason: "toolUse" },
  );
  faux.setResponses([response, response, response]);
  const operation = {
    type: "agent" as const,
    operationId: "scope-test",
    operationKind: "prompt" as const,
  };
  const [brunch, other, task] = await Promise.allSettled([
    registration!.interceptor(
      operation,
      { agentName: "brunch-chat-agent" },
      async () => drain(provider.streamSimple(model, { messages: [] })),
    ),
    registration!.interceptor(
      operation,
      { agentName: "unrelated-agent" },
      async () => drain(provider.streamSimple(model, { messages: [] })),
    ),
    registration!.interceptor(
      operation,
      { agentName: "brunch-chat-agent" },
      async () =>
        registration!.interceptor(
          { type: "task", taskId: "delegated" },
          {},
          async () => drain(provider.streamSimple(model, { messages: [] })),
        ),
    ),
  ]);
  expect(brunch.status).toBe("rejected");
  expect(other.status).toBe("fulfilled");
  expect(task.status).toBe("fulfilled");
});
