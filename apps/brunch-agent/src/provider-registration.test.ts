import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  normalizeContext,
  type Provider,
} from "@earendil-works/pi-ai";
import { instrument, setProvider } from "@flue/runtime";
import { Hono } from "hono";
import { beforeAll, expect, test, vi } from "vitest";

vi.mock("./server/telemetry-bootstrap.ts", () => ({}));
vi.mock("./agents/petrinaut/agent.ts", () => ({
  PetrinautAgent: { agentName: "brunch-chat-agent" },
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
// The native OpenRouter provider is kept; the spy only records the instance app.ts receives.
vi.mock(
  "@earendil-works/pi-ai/providers/openrouter",
  async (importOriginal) => {
    const native =
      await importOriginal<
        typeof import("@earendil-works/pi-ai/providers/openrouter")
      >();
    return {
      ...native,
      openrouterProvider: vi.fn<typeof native.openrouterProvider>(
        native.openrouterProvider,
      ),
    };
  },
);
let registeredProviders: Parameters<typeof setProvider>[0][] = [];
let instrumentations: Parameters<typeof instrument>[0][] = [];
let nativeOpenRouterProvider: Provider | undefined;

beforeAll(async () => {
  await import("./app");
  registeredProviders = vi
    .mocked(setProvider)
    .mock.calls.map(([provider]) => provider);
  instrumentations = vi
    .mocked(instrument)
    .mock.calls.map(([instrumentation]) => instrumentation);
  const { openrouterProvider } =
    await import("@earendil-works/pi-ai/providers/openrouter");
  const result = vi.mocked(openrouterProvider).mock.results[0];
  nativeOpenRouterProvider =
    result?.type === "return" ? result.value : undefined;
});

test("app registration admits the Anthropic, OpenAI and OpenRouter providers", () => {
  const ids = registeredProviders.map((provider) => provider.id).sort();
  expect(ids).toEqual(["anthropic", "openai", "openrouter"]);
});

test("app registration admits native OpenRouter with GPT-6.1 Sol and its API-key auth", async () => {
  const native = nativeOpenRouterProvider;
  expect(native).toBeDefined();
  const provider = registeredProviders.find(
    (provider) => provider.id === "openrouter",
  )!;
  expect(provider.auth).toBe(native!.auth);
  // The catalogue extension keeps native streams, so a different stream is the admission wrapper.
  expect(Reflect.get(provider, "streamSimple")).not.toBe(
    Reflect.get(native!, "streamSimple"),
  );
  const models = createModels();
  models.setProvider(provider);
  expect(models.getModel("openrouter", "openai/gpt-6.1-sol")).toMatchObject({
    id: "openai/gpt-6.1-sol",
    provider: "openrouter",
    api: "openai-completions",
    baseUrl: "https://openrouter.ai/api/v1",
    reasoning: true,
  });
  vi.stubEnv("OPENROUTER_API_KEY", "synthetic-openrouter-key");
  try {
    expect(await models.getAuth("openrouter")).toMatchObject({
      source: "OPENROUTER_API_KEY",
      auth: { apiKey: "synthetic-openrouter-key" },
    });
  } finally {
    vi.unstubAllEnvs();
  }
});

const drain = async (stream: ReturnType<Provider["streamSimple"]>) => {
  for await (const _event of stream) {
    /* Drain the public provider stream. */
  }
  return stream.result();
};

test("app registration scopes admission to the Petrinaut agent's execution, isolating concurrent agents and delegated tasks", async () => {
  const registration = instrumentations.find(
    (instrumentation) =>
      instrumentation.key === Symbol.for("brunch.buffered-tool-admission"),
  );
  expect(registration).toBeDefined();
  const provider = registeredProviders.find(
    (provider) => provider.id === "anthropic",
  )!;

  expect(provider.auth).toBe(faux.provider.auth);
  expect(provider.getModels()).toEqual(faux.provider.getModels());
  const model = provider.getModels()[0]!;
  const response = fauxAssistantMessage(
    [
      fauxToolCall("getLatestNetDefinition", {}),
      fauxToolCall("query_basis", {}),
    ],
    { stopReason: "toolUse" },
  );
  faux.setResponses([response, response, response]);
  const operation = {
    type: "agent" as const,
    operationId: "scope-test",
    operationKind: "prompt" as const,
  };
  const context = normalizeContext({ messages: [] });
  const [brunch, other, task] = await Promise.allSettled([
    registration!.interceptor(
      operation,
      { agentName: "brunch-chat-agent" },
      async () => drain(provider.streamSimple(model, context)),
    ),
    registration!.interceptor(
      operation,
      { agentName: "unrelated-agent" },
      async () => drain(provider.streamSimple(model, context)),
    ),
    registration!.interceptor(
      operation,
      { agentName: "brunch-chat-agent" },
      async () =>
        registration!.interceptor(
          { type: "task", taskId: "delegated" },
          {},
          async () => drain(provider.streamSimple(model, context)),
        ),
    ),
  ]);
  expect(brunch.status).toBe("rejected");
  expect(other.status).toBe("fulfilled");
  expect(task.status).toBe("fulfilled");
});
