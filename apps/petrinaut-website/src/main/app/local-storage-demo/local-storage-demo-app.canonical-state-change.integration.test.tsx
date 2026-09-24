import { once } from "node:events";
import { createServer } from "node:http";
/** @vitest-environment jsdom */
/// <reference path="../../../../../../libs/@hashintel/petrinaut/src/ui/fontsource.d.ts" />
import { join } from "node:path";
import { pathToFileURL } from "node:url";

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

import { clientToolHistoryFrom } from "@hashintel/brunch-agent-transport-aisdk";
import {
  type LspWorkerFactory,
  type PetrinautDocHandle,
  type SDCPN,
} from "@hashintel/petrinaut-core";
import {
  compileHirArtifacts,
  lowerScenarioToHir,
} from "@hashintel/petrinaut-core/hir";

import { assistantSelectionStorageKey } from "./assistant-selection";
import { LocalStorageDemoApp } from "./local-storage-demo-app";

import type { DocumentRepository } from "./documents/document-repository";
import type { FlueClient } from "@flue/sdk";
import type { ComponentProps, ReactNode } from "react";

vi.hoisted(() => {
  window.matchMedia = (media) => ({
    media,
    matches: false,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  });
  Object.defineProperty(document, "queryCommandSupported", {
    configurable: true,
    value: () => false,
  });
  Object.defineProperty(window, "CSS", {
    configurable: true,
    value: {
      ...window.CSS,
      escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "\\$&"),
    },
  });
});

const fixture = vi.hoisted(() => ({
  origin: null as string | null,
  client: null as FlueClient | null,
  handle: null as PetrinautDocHandle | null,
  repository: null as DocumentRepository | null,
}));
vi.mock("@flue/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@flue/sdk")>();
  return {
    ...actual,
    createFlueClient: (
      options: Parameters<typeof actual.createFlueClient>[0],
    ) => {
      // Preserve the server's private in-process history client.
      if (options.fetch !== undefined) return actual.createFlueClient(options);
      if (!fixture.origin) throw new Error("Brunch application is not ready");
      const client = actual.createFlueClient({
        ...options,
        url: `${fixture.origin}${new URL(options.url).pathname}`,
      });
      fixture.client = client;
      return client;
    },
  };
});
vi.mock("@hashintel/petrinaut/ui", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hashintel/petrinaut/ui")>();
  return {
    ...actual,
    WalkthroughProvider: ({ children }: { children: ReactNode }) => children,
    Petrinaut: (props: ComponentProps<typeof actual.Petrinaut>) => {
      fixture.handle = props.handle;
      return <actual.Petrinaut {...props} />;
    },
  };
});
vi.mock("./documents/use-document-controller", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("./documents/use-document-controller")
    >();
  return {
    ...actual,
    useDocumentController: (
      input: Parameters<typeof actual.useDocumentController>[0],
    ) => {
      const result = actual.useDocumentController(input);
      fixture.repository = result.controller.source.repository;
      return result;
    },
  };
});
vi.mock("./brunch-preview-config", () => ({
  resolveBrunchPreviewConfig: () => ({
    chatEndpoint: "/agents/chat",
    isBrunchConfigured: true,
    evaluationMode: "I",
    serverMode: "integrated-brunch-canonical",
  }),
}));
vi.mock("./brunch-principal", () => ({
  getOrCreateBrunchPrincipal: () => "test-principal",
}));

const originalFetch = globalThis.fetch;
beforeAll(async () => {
  await import("monaco-editor");
  globalThis.fetch = (resource, options) => {
    const request =
      resource instanceof Request ? resource : new Request(resource, options);
    const url = new URL(request.url);
    if (
      fixture.origin &&
      url.origin === fixture.origin &&
      url.pathname.startsWith("/agents/chat/")
    )
      return originalFetch(request);
    return Promise.reject(new Error("External fetch forbidden"));
  };
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "Worker",
    class {
      private listeners = new Set<(event: MessageEvent) => void>();
      constructor(_url: unknown) {}
      postMessage(
        message: Parameters<
          Awaited<ReturnType<LspWorkerFactory>>["postMessage"]
        >[0],
      ) {
        if (!("id" in message)) return;
        const result =
          message.method === "sdcpn/diagnostics"
            ? []
            : message.method === "sdcpn/compileHirArtifacts"
              ? compileHirArtifacts(
                  message.params.sdcpn,
                  message.params.extensions,
                  message.params.options,
                )
              : message.method === "sdcpn/lowerScenario"
                ? lowerScenarioToHir(message.params.scenario, {
                    adHocContext: message.params.adHocContext,
                  })
                : null;
        queueMicrotask(() => {
          for (const listener of this.listeners)
            listener({
              data: { jsonrpc: "2.0", id: message.id, result },
            } as MessageEvent);
        });
      }
      addEventListener(_type: string, listener: (event: MessageEvent) => void) {
        this.listeners.add(listener);
      }
      removeEventListener(
        _type: string,
        listener: (event: MessageEvent) => void,
      ) {
        this.listeners.delete(listener);
      }
      terminate() {
        this.listeners.clear();
      }
    },
  );
}, 30_000);
afterEach(() => {
  cleanup();
  fixture.handle = null;
  fixture.repository = null;
  localStorage.clear();
});
afterAll(() => {
  globalThis.fetch = originalFetch;
});

const initialDefinition: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};
const scenario = {
  id: "baseline",
  name: "Baseline",
  scenarioParameters: [],
  parameterOverrides: {},
  initialState: { type: "per_place" as const, content: {} },
};
const metric = { id: "throughput", name: "Throughput", code: "return 1;" };

test("real panel scenario and metric add/update/remove calls produce persisted revisions and a Brunch continuation", async () => {
  process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
  process.env.BRUNCH_DEV_DB_PATH = ":memory:";
  process.env.OTEL_SDK_DISABLED = "true";
  const faux = fauxProvider({
    provider: "anthropic",
    models: [{ id: "claude-sonnet-4-6" }],
  });
  faux.setResponses([
    fauxAssistantMessage(
      [fauxToolCall("addScenario", scenario, { id: "scenario-call" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [fauxToolCall("addMetric", metric, { id: "metric-call" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [
        fauxToolCall(
          "updateScenario",
          { scenarioId: scenario.id, update: { name: "Updated baseline" } },
          { id: "update-scenario-call" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [
        fauxToolCall(
          "updateMetric",
          { metricId: metric.id, update: { name: "Updated throughput" } },
          { id: "update-metric-call" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [
        fauxToolCall(
          "removeScenario",
          { scenarioId: scenario.id },
          { id: "remove-scenario-call" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [
        fauxToolCall(
          "removeMetric",
          { metricId: metric.id },
          { id: "remove-metric-call" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([
      fauxText("All six scenario and metric tools returned."),
    ]),
  ]);
  const application = (await import(
    pathToFileURL(join(process.cwd(), "../brunch-agent/dist/app.mjs")).href
  )) as {
    loadFlueNodeApplication: () => Promise<{
      fetch: typeof fetch;
      stop: () => Promise<void>;
    }>;
  };
  const server = await application.loadFlueNodeApplication();
  setProvider(faux.provider);
  const httpServer = createServer((request, response) => {
    void (async () => {
      const chunks: Uint8Array[] = [];
      for await (const chunk of request) chunks.push(chunk as Uint8Array);
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers))
        if (value !== undefined)
          headers.set(name, Array.isArray(value) ? value.join(",") : value);
      const body = Buffer.concat(chunks).toString("utf8");
      const result = await server.fetch(
        new Request(
          `http://127.0.0.1:${(httpServer.address() as { port: number }).port}${request.url}`,
          {
            method: request.method,
            headers,
            ...(body ? { body } : {}),
          },
        ),
      );
      response.writeHead(result.status, Object.fromEntries(result.headers));
      if (result.body) {
        const reader = result.body.getReader();
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          if (!response.write(next.value)) await once(response, "drain");
        }
      }
      response.end();
    })().catch((error: unknown) => response.writeHead(500).end(String(error)));
  });
  httpServer.listen(0, "127.0.0.1");
  await once(httpServer, "listening");
  fixture.origin = `http://127.0.0.1:${(httpServer.address() as { port: number }).port}`;
  const documentId = "net-1";
  const initialRevisionId = "initial-revision";
  // Pass-through spy: every localStorage write of this document, in order.
  const storageSpy = vi.spyOn(Storage.prototype, "setItem");
  const storageWrites = () =>
    storageSpy.mock.calls.flatMap(([key, value], index) => {
      if (
        storageSpy.mock.contexts[index] !== localStorage ||
        key !== "petrinaut-sdcpn"
      )
        return [];
      const document = (
        JSON.parse(value) as Record<
          string,
          { revisionId: string; sdcpn: SDCPN }
        >
      )[documentId];
      return document
        ? [{ revisionId: document.revisionId, definition: document.sdcpn }]
        : [];
    });
  let unmount = () => {};
  try {
    localStorage.setItem(assistantSelectionStorageKey, "brunch");
    localStorage.setItem(
      "petrinaut-sdcpn",
      JSON.stringify({
        [documentId]: {
          id: documentId,
          incarnationId: "incarnation",
          revisionId: initialRevisionId,
          title: "Queue",
          sdcpn: initialDefinition,
          lastUpdated: new Date(0).toISOString(),
        },
      }),
    );
    ({ unmount } = render(
      <LocalStorageDemoApp search={{}} onSearchChange={() => {}} />,
    ));
    const showPanel = await screen.findByRole("button", {
      name: "Show AI assistant",
    });
    const handle = fixture.handle;
    if (!handle)
      throw new Error("The real editor did not receive a document handle");
    const changes: {
      previousRevisionId: string;
      revisionId: string;
      scenarios: { id: string; name: string }[];
      metrics: { id: string; name: string }[];
    }[] = [];
    const unsubscribe = handle.subscribe((event) =>
      changes.push({
        previousRevisionId: event.previousRevisionId,
        revisionId: event.revisionId,
        scenarios:
          event.next.scenarios?.map(({ id, name }) => ({ id, name })) ?? [],
        metrics:
          event.next.metrics?.map(({ id, name }) => ({ id, name })) ?? [],
      }),
    );
    fireEvent.click(showPanel);
    const composer = await screen.findByRole<HTMLTextAreaElement>("textbox", {
      name: "Message AI assistant",
    });
    fireEvent.change(composer, {
      target: { value: "Create a baseline scenario and throughput metric." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(
      await screen.findByText(
        "All six scenario and metric tools returned.",
        {},
        { timeout: 15_000 },
      ),
    ).not.toBeNull();
    const history = await fixture.client?.history();
    if (!history)
      throw new Error("The real Brunch conversation was not created");
    const expectedCalls = [
      ["scenario-call", "addScenario"],
      ["metric-call", "addMetric"],
      ["update-scenario-call", "updateScenario"],
      ["update-metric-call", "updateMetric"],
      ["remove-scenario-call", "removeScenario"],
      ["remove-metric-call", "removeMetric"],
    ] as const;
    const deliveries = clientToolHistoryFrom(history.messages).results.filter(
      ({ toolCallId }) => expectedCalls.some(([id]) => id === toolCallId),
    );
    expect(deliveries).toHaveLength(6);
    expect(deliveries).toMatchObject(
      expectedCalls.map(([toolCallId, toolName]) => ({
        toolCallId,
        toolName,
        output: { applied: true },
      })),
    );
    await waitFor(() => expect(changes).toHaveLength(6));
    expect(deliveries.map(({ metadata }) => metadata)).toEqual(
      changes.map((change) => ({
        documentRevision: {
          before: change.previousRevisionId,
          after: change.revisionId,
        },
      })),
    );
    const originalScenario = { id: scenario.id, name: scenario.name };
    const originalMetric = { id: metric.id, name: metric.name };
    const updatedScenario = { ...originalScenario, name: "Updated baseline" };
    const updatedMetric = { ...originalMetric, name: "Updated throughput" };
    expect(
      changes.map(({ scenarios, metrics }) => ({ scenarios, metrics })),
    ).toEqual([
      { scenarios: [originalScenario], metrics: [] },
      { scenarios: [originalScenario], metrics: [originalMetric] },
      { scenarios: [updatedScenario], metrics: [originalMetric] },
      { scenarios: [updatedScenario], metrics: [updatedMetric] },
      { scenarios: [], metrics: [updatedMetric] },
      { scenarios: [], metrics: [] },
    ]);
    expect(changes[0]?.previousRevisionId).toBe(initialRevisionId);
    for (let index = 1; index < changes.length; index++) {
      expect(changes[index]?.previousRevisionId).toBe(
        changes[index - 1]?.revisionId,
      );
    }
    expect(new Set(changes.map(({ revisionId }) => revisionId)).size).toBe(6);
    const lastRevisionId = changes.at(-1)?.revisionId;
    if (!lastRevisionId) throw new Error("The final change had no revision");
    await waitFor(() => {
      const stored = JSON.parse(
        localStorage.getItem("petrinaut-sdcpn") ?? "{}",
      ) as Record<
        string,
        {
          revisionId: string;
          sdcpn: SDCPN;
        }
      >;
      expect(stored[documentId]?.revisionId).toBe(lastRevisionId);
      expect(stored[documentId]?.sdcpn.scenarios ?? []).toEqual([]);
      expect(stored[documentId]?.sdcpn.metrics ?? []).toEqual([]);
    });
    for (const change of changes) {
      const saved = storageWrites().find(
        ({ revisionId }) => revisionId === change.revisionId,
      );
      expect(saved).toBeDefined();
      expect(
        saved?.definition.scenarios?.map(({ id, name }) => ({ id, name })) ??
          [],
      ).toEqual(change.scenarios);
      expect(
        saved?.definition.metrics?.map(({ id, name }) => ({ id, name })) ?? [],
      ).toEqual(change.metrics);
    }
    const repository = fixture.repository;
    if (!repository)
      throw new Error("The real document repository was not mounted");
    expect(handle.revisionId.get()).toBe(lastRevisionId);
    await expect(
      repository.settleRevision({ documentId, revisionId: lastRevisionId }),
    ).resolves.toBeUndefined();
    unsubscribe();
  } finally {
    unmount();
    storageSpy.mockRestore();
    fixture.origin = null;
    fixture.client = null;
    httpServer.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      httpServer.close((error) => (error ? reject(error) : resolve())),
    );
    await server.stop();
  }
}, 30_000);
