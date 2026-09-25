/** @vitest-environment jsdom */
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
  petrinautAiModel,
  type PetrinautDocHandle,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { loadBuiltBrunchApplication } from "../../../../../brunch-agent/test/load-built-application";
import {
  InProcessLspWorker,
  NoopResizeObserver,
  preloadMonaco,
} from "../shared/petrinaut-jsdom";
import { assistantSelectionStorageKey } from "./assistant-selection";
import { LocalStorageDemoApp } from "./local-storage-demo-app";

import type { DocumentRepository } from "./documents/document-repository";
import type { FlueClient } from "@flue/sdk";
import type { ComponentProps, ReactNode } from "react";

await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("../shared/petrinaut-jsdom");
  installPetrinautDomShims();
});

const fixture = vi.hoisted(() => ({
  fetch: null as typeof fetch | null,
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
      const client = actual.createFlueClient(options);
      // The server's own in-process history client passes its own fetch.
      if (options.fetch === undefined) fixture.client = client;
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
      fixture.repository = result.controller.repository;
      return result;
    },
  };
});
vi.mock("./brunch-preview-config", () => ({
  resolveBrunchPreviewConfig: () => ({
    chatEndpoint: "/agents/chat",
    isBrunchConfigured: true,
  }),
}));
vi.mock("./brunch-principal", () => ({
  getOrCreateBrunchPrincipal: () => "test-principal",
}));

const originalFetch = globalThis.fetch;
beforeAll(async () => {
  await preloadMonaco();
  // The panel reaches Brunch through its Flue client and its browser-call and
  // live-tool requests alike; all of them go to the built app in process.
  globalThis.fetch = (resource, options) => {
    const request =
      resource instanceof Request ? resource : new Request(resource, options);
    if (
      fixture.fetch &&
      new URL(request.url).pathname.startsWith("/agents/chat/")
    )
      return fixture.fetch(request);
    return Promise.reject(new Error("External fetch forbidden"));
  };
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.stubGlobal("Worker", InProcessLspWorker);
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
  delete process.env.BRUNCH_CHAT_MODEL;
  delete process.env.BRUNCH_CHAT_THINKING;
  process.env.BRUNCH_DEV_DB_PATH = ":memory:";
  process.env.OTEL_SDK_DISABLED = "true";
  const faux = fauxProvider({
    provider: "openai",
    models: [{ id: petrinautAiModel.id, reasoning: true }],
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
  const server = await loadBuiltBrunchApplication();
  setProvider(faux.provider);
  fixture.fetch = async (input, init) =>
    server.fetch(input instanceof Request ? input : new Request(input, init));
  const documentId = "net-1";
  const initialRevisionId = "initial-revision";
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
    fixture.fetch = null;
    fixture.client = null;
    await server.stop();
  }
}, 30_000);
