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
const openaiFaux = fauxProvider({
  provider: "openai",
  models: [{ id: "synthetic-openai" }],
});
vi.mock("@earendil-works/pi-ai/providers/anthropic", () => ({
  anthropicProvider: () => faux.provider,
}));
vi.mock("@earendil-works/pi-ai/providers/openai", () => ({
  openaiProvider: () => openaiFaux.provider,
}));

let registeredProviders: Parameters<typeof setProvider>[0][] = [];
let instrumentations: Parameters<typeof instrument>[0][] = [];

beforeAll(async () => {
  await import("../src/app");
  registeredProviders = vi
    .mocked(setProvider)
    .mock.calls.map(([entry]) => entry);
  instrumentations = vi.mocked(instrument).mock.calls.map(([entry]) => entry);
});

test("app registration admits both Anthropic and OpenAI providers", () => {
  const ids = registeredProviders.map((entry) => entry.id).sort();
  expect(ids).toEqual(["anthropic", "openai"]);
});

const drain = async (stream: ReturnType<Provider["streamSimple"]>) => {
  for await (const _event of stream) {
    /* Drain the public provider stream. */
  }
  return stream.result();
};

test("app registration scopes admission to ChatAgent execution, isolating concurrent agents and delegated tasks", async () => {
  const registration = instrumentations.find(
    (entry) => entry.key === Symbol.for("brunch.buffered-tool-admission"),
  );

  expect(registration).toBeDefined();
  const provider = registeredProviders.find(
    (entry) => entry.id === "anthropic",
  )!;

  expect(provider.auth).toBe(faux.provider.auth);
  expect(provider.getModels()).toEqual(faux.provider.getModels());
  const model = provider.getModels()[0]!;
  const response = fauxAssistantMessage(
    [
      fauxToolCall("getLatestNetDefinition", {}),
      fauxToolCall("query_workpiece", {}),
    ],
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
