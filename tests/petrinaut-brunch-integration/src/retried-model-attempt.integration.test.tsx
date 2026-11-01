// @vitest-environment jsdom
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { setProvider } from "@flue/runtime";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

import { loadBuiltBrunchApplication } from "@apps/brunch-agent/testing/load-built-application";
import { assistantSelectionStorageKey } from "@apps/petrinaut-website/src/main/app/local-storage-demo/assistant-selection";
import { LocalStorageDemoApp } from "@apps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app";
import {
  InProcessLspWorker,
  NoopResizeObserver,
  preloadMonaco,
} from "@apps/petrinaut-website/src/main/app/shared/petrinaut-jsdom";
import { clientToolHistoryFrom } from "@hashintel/brunch-agent";
import { toPetrinautId } from "@hashintel/petrinaut-core";

import type { ConversationStreamChunk, FlueClient } from "@flue/sdk";
import type { PetrinautDocHandle, SDCPN } from "@hashintel/petrinaut-core";
import type { UIMessageChunk } from "ai";
import type { ComponentProps } from "react";

await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("@apps/petrinaut-website/src/main/app/shared/petrinaut-jsdom");
  installPetrinautDomShims();
});

const fixture = vi.hoisted(() => ({
  fetch: null as typeof fetch | null,
  client: null as FlueClient | null,
  handle: null as PetrinautDocHandle | null,
  /** Every Flue chunk the panel's transport followed. */
  flueChunks: [] as ConversationStreamChunk[],
  /** Every AI SDK chunk the panel's transport produced. */
  uiChunks: [] as UIMessageChunk[],
  /** Response statuses of the panel's browser-call claims, by tool call id. */
  claims: new Map<string, number[]>(),
}));
vi.mock("@flue/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@flue/sdk")>();
  return {
    ...actual,
    createFlueClient: (
      options: Parameters<typeof actual.createFlueClient>[0],
    ) => {
      const client = actual.createFlueClient(options);
      // The server's own in-process history client passes its own fetch.
      if (options.fetch !== undefined) return client;
      fixture.client = client;
      const wait = client.wait.bind(client);
      client.wait = (target, waitOptions) =>
        wait(target, {
          ...waitOptions,
          onEvent: (event) => {
            fixture.flueChunks.push(event);
            return waitOptions?.onEvent?.(event);
          },
        });
      return client;
    },
  };
});
vi.mock("@local/flue-aisdk-transport", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@local/flue-aisdk-transport")>();
  return {
    ...actual,
    createFlueAiSdkAdapter: ((config) => {
      const adapter = actual.createFlueAiSdkAdapter(config);
      return {
        ...adapter,
        chatTransport: (options) => {
          const transport = adapter.chatTransport(options);
          return {
            ...transport,
            sendMessages: async (request) =>
              (await transport.sendMessages(request)).pipeThrough(
                new TransformStream<UIMessageChunk, UIMessageChunk>({
                  transform: (chunk, controller) => {
                    fixture.uiChunks.push(chunk);
                    controller.enqueue(chunk);
                  },
                }),
              ),
          };
        },
      };
    }) as typeof actual.createFlueAiSdkAdapter,
  };
});
vi.mock("@hashintel/petrinaut/ui", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hashintel/petrinaut/ui")>();
  return {
    ...actual,
    Petrinaut: (props: ComponentProps<typeof actual.Petrinaut>) => {
      fixture.handle = props.handle;
      return <actual.Petrinaut {...props} />;
    },
  };
});
vi.mock(
  "@apps/petrinaut-website/src/main/app/plugins/brunch/brunch-preview-config",
  () => ({
    resolveBrunchPreviewConfig: () => ({
      chatEndpoint: "/agents/petrinaut",
      isBrunchConfigured: true,
    }),
  }),
);
vi.mock(
  "@apps/petrinaut-website/src/main/app/plugins/brunch/conversation/brunch-owner-key",
  () => ({
    getOrCreateBrunchOwnerKey: () => "test-owner",
  }),
);

const originalFetch = globalThis.fetch;
beforeAll(async () => {
  await preloadMonaco();
  globalThis.fetch = (resource, options) => {
    const request =
      resource instanceof Request ? resource : new Request(resource, options);
    const { pathname } = new URL(request.url);
    if (!fixture.fetch || !pathname.startsWith("/agents/petrinaut/"))
      return Promise.reject(new Error("External fetch forbidden"));
    const claimed = /\/browser-calls\/(?<toolCallId>[^/]+)$/u.exec(pathname)
      ?.groups?.toolCallId;
    if (claimed === undefined || request.method !== "GET")
      return fixture.fetch(request);
    return fixture.fetch(request).then((response) => {
      const toolCallId = decodeURIComponent(claimed);
      fixture.claims.set(toolCallId, [
        ...(fixture.claims.get(toolCallId) ?? []),
        response.status,
      ]);
      return response;
    });
  };
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.stubGlobal("Worker", InProcessLspWorker);
}, 30_000);
afterEach(() => {
  cleanup();
  fixture.handle = null;
  fixture.flueChunks.length = 0;
  fixture.uiChunks.length = 0;
  fixture.claims.clear();
  localStorage.clear();
});
afterAll(() => {
  globalThis.fetch = originalFetch;
});

const ignoreNavigation = () => {};
const emptySearch = {};

const initialDefinition: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};
const scenarioNamed = (id: string, name: string) => ({
  id,
  name,
  scenarioParameters: [],
  parameterOverrides: {},
  initialState: { type: "per_place" as const, content: {} },
});
const supersededScenario = scenarioNamed("superseded", "Superseded scenario");
const replacementScenario = scenarioNamed(
  "replacement",
  "Replacement scenario",
);
const laterMetric = { id: "later", name: "Later metric", code: "return 1;" };
const finalText = "Recorded the scenario and metric after the retry.";

const chunkIndex = (predicate: (chunk: UIMessageChunk) => boolean): number =>
  fixture.uiChunks.findIndex(predicate);

/**
 * A model attempt that fails with an error Flue classifies as transient, so
 * Flue retries it inside the same response. History then omits the attempt,
 * and Flue folds the start of each later step into a `conversation-reset`.
 */
test("a model attempt Flue retries never runs, and the panel settles on the history without it", async () => {
  process.env.BRUNCH_CHAT_MODEL = "openai/faux-model";
  process.env.BRUNCH_CHAT_THINKING = "medium";
  process.env.BRUNCH_DEV_DB_PATH = ":memory:";
  process.env.OTEL_SDK_DISABLED = "true";
  const faux = fauxProvider({
    provider: "openai",
    models: [{ id: "faux-model", reasoning: true }],
  });
  faux.setResponses([
    fauxAssistantMessage(
      [fauxToolCall("readNetOutline", {}, { id: "outline-call" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [
        fauxToolCall("addScenario", supersededScenario, {
          id: "superseded-call",
        }),
      ],
      { stopReason: "error", errorMessage: "503 Service Unavailable" },
    ),
    fauxAssistantMessage(
      [
        fauxToolCall("addScenario", replacementScenario, {
          id: "replacement-call",
        }),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [fauxToolCall("addMetric", laterMetric, { id: "later-call" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([fauxText(finalText)]),
  ]);
  const server = await loadBuiltBrunchApplication();
  setProvider(faux.provider);
  fixture.fetch = async (input, init) =>
    server.fetch(input instanceof Request ? input : new Request(input, init));
  const documentId = toPetrinautId("net-1");
  let unmount = () => {};
  try {
    localStorage.setItem(assistantSelectionStorageKey, "brunch");
    localStorage.setItem(
      "petrinaut:plugin:website.walkthrough",
      JSON.stringify({ showOnInit: false }),
    );
    localStorage.setItem(
      "petrinaut-sdcpn",
      JSON.stringify({
        [documentId]: {
          id: documentId,
          revisionId: "initial-revision",
          title: "Queue",
          sdcpn: initialDefinition,
          lastUpdated: new Date(0).toISOString(),
        },
      }),
    );
    ({ unmount } = render(
      <LocalStorageDemoApp
        netId={documentId}
        onOpenNet={ignoreNavigation}
        search={emptySearch}
        onSearchChange={ignoreNavigation}
      />,
    ));
    const showPanel = await screen.findByRole("button", {
      name: "Show AI assistant",
    });
    const handle = fixture.handle;
    if (!handle)
      throw new Error("The real editor did not receive a document handle");
    const changes: { scenarios: string[]; metrics: string[] }[] = [];
    const unsubscribe = handle.subscribe((event) =>
      changes.push({
        scenarios: event.next.scenarios?.map(({ name }) => name) ?? [],
        metrics: event.next.metrics?.map(({ name }) => name) ?? [],
      }),
    );
    fireEvent.click(showPanel);
    const composer = await screen.findByRole<HTMLTextAreaElement>("textbox", {
      name: "Message AI assistant",
    });
    fireEvent.change(composer, {
      target: { value: "Add a scenario and a metric." },
    });
    let supersededRowShown = false;
    const rowObserver = new MutationObserver(() => {
      supersededRowShown ||= document.body.textContent.includes(
        "Superseded scenario",
      );
    });
    rowObserver.observe(document.body, {
      characterData: true,
      childList: true,
      subtree: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(
      await screen.findByText(finalText, {}, { timeout: 20_000 }),
    ).not.toBeNull();

    // The reset path ran: Flue folded later step starts into resets.
    const firstStart = fixture.flueChunks.findIndex(
      (chunk) => chunk.type === "message-started",
    );
    expect(firstStart).toBeGreaterThan(-1);
    expect(
      fixture.flueChunks
        .slice(firstStart)
        .some((chunk) => chunk.type === "conversation-reset"),
    ).toBe(true);

    // Every step keeps its boundaries, and the replacement and later steps
    // still preview their tool input before Flue admits it.
    const stepStarts = fixture.uiChunks.filter(
      (chunk) => chunk.type === "start-step",
    ).length;
    expect(stepStarts).toBe(5);
    expect(
      fixture.uiChunks.filter((chunk) => chunk.type === "finish-step"),
    ).toHaveLength(stepStarts);
    for (const toolCallId of ["replacement-call", "later-call"]) {
      const inputStart = chunkIndex(
        (chunk) =>
          chunk.type === "tool-input-start" && chunk.toolCallId === toolCallId,
      );
      expect(inputStart).toBeGreaterThan(-1);
      expect(
        chunkIndex(
          (chunk) =>
            chunk.type === "tool-input-available" &&
            chunk.toolCallId === toolCallId,
        ),
      ).toBeGreaterThan(inputStart);
    }
    // Observed: the live stream cannot withdraw the superseded call.
    expect(
      chunkIndex(
        (chunk) =>
          chunk.type === "tool-input-available" &&
          chunk.toolCallId === "superseded-call",
      ),
    ).toBeGreaterThan(-1);

    // Nothing ran the superseded call. The panel does try to claim it, as it
    // claims every client call it sees, but the server never issued it.
    await waitFor(() => expect(changes).toHaveLength(2));
    expect(fixture.claims.get("superseded-call")?.length).toBeGreaterThan(0);
    expect(
      fixture.claims.get("superseded-call")?.every((status) => status === 404),
    ).toBe(true);
    expect(changes).toEqual([
      { scenarios: ["Replacement scenario"], metrics: [] },
      { scenarios: ["Replacement scenario"], metrics: ["Later metric"] },
    ]);
    const history = await fixture.client?.history();
    if (!history)
      throw new Error("The real Brunch conversation was not created");
    expect(JSON.stringify(history.messages)).not.toContain("superseded-call");
    expect(
      clientToolHistoryFrom(history.messages).results.map(
        ({ toolCallId, output }) => ({ toolCallId, output }),
      ),
    ).toMatchObject([
      { toolCallId: "outline-call" },
      { toolCallId: "replacement-call", output: { applied: true } },
      { toolCallId: "later-call", output: { applied: true } },
    ]);

    // The live panel showed the attempt; at settlement it follows history,
    // which omits it.
    rowObserver.disconnect();
    expect(supersededRowShown).toBe(true);
    await waitFor(
      () =>
        expect(document.body.textContent).not.toContain("Superseded scenario"),
      { timeout: 10_000 },
    );
    expect(document.body.textContent).toContain("Added scenario Replacement");
    expect(document.body.textContent).toContain("Added metric Later metric");
    expect(document.body.textContent).toContain(finalText);
    unsubscribe();
  } finally {
    unmount();
    fixture.fetch = null;
    fixture.client = null;
    await server.stop();
  }
}, 40_000);
