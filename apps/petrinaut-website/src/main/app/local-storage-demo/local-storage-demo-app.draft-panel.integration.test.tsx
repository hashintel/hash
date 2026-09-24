/** @vitest-environment jsdom */
import { createHash } from "node:crypto";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import {
  createJsonDocHandle,
  type LspWorkerFactory,
  type SDCPN,
} from "@hashintel/petrinaut-core";
import {
  compileHirArtifacts,
  lowerScenarioToHir,
} from "@hashintel/petrinaut-core/hir";

import {
  brunchEvaluationConversationIdFrom,
  ordinaryConstructionConversationIdFrom,
} from "./brunch-conversation-id";
import { resolveDraftAuthorityFromHistory } from "./brunch-draft-experiment-interactive-tool";
import {
  createCanonicalPetrinautHostTools,
  EMPTY_CANONICAL_PETRINAUT_REPLAY,
} from "./brunch-petrinaut-tools";
import { LocalStorageDemoApp } from "./local-storage-demo-app";

import type {
  DocumentController,
  DocumentRecord,
} from "./documents/document-repository";
import type { FlueClient, FlueConversationState } from "@flue/sdk";
import type { ReactNode } from "react";

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
  class ClipboardItem {
    constructor(readonly items: Record<string, Blob | Promise<Blob>>) {}
  }
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      write: (items: ClipboardItem[]) =>
        Promise.all(
          items.flatMap((item) =>
            Object.values(item.items).map((value) => Promise.resolve(value)),
          ),
        ).then(() => undefined),
    },
  });
  Object.defineProperty(window, "ClipboardItem", {
    configurable: true,
    value: ClipboardItem,
  });
});

const fixture = vi.hoisted(() => ({
  client: null as FlueClient | null,
  controller: null as DocumentController | null,
  binding: null as {
    documentId: string;
    incarnationId: string;
    conversationId: string;
  } | null,
  baseBinding: null as {
    documentId: string;
    incarnationId: string;
    conversationId: string;
  } | null,
}));
vi.mock(
  "@hashintel/petrinaut-core/workers/monte-carlo",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@hashintel/petrinaut-core/workers/monte-carlo")
      >();
    return {
      ...actual,
      createMonteCarloWorker: actual.createInProcessMonteCarloWorker,
    };
  },
);
vi.mock("@hashintel/petrinaut/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@hashintel/petrinaut/ui")>()),
  WalkthroughProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@flue/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flue/sdk")>()),
  createFlueClient: () => {
    if (!fixture.client) throw new Error("Missing test Flue client");
    return fixture.client;
  },
}));
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
vi.mock("./documents/use-document-controller", () => ({
  useDocumentController: () => {
    if (!fixture.controller)
      throw new Error("Missing test document controller");
    return { controller: fixture.controller };
  },
}));
vi.mock("./assistants/brunch/use-process-agent-binding", () => ({
  useProcessAgentBinding: () => {
    if (!fixture.baseBinding)
      throw new Error("Missing test process agent binding");
    return fixture.baseBinding;
  },
}));

beforeAll(async () => {
  await import("monaco-editor");
}, 30_000);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // A lazy language-server import may finish after unmount; keep this isolated
  // file's Worker shim alive until Vitest disposes its jsdom environment.
});

const definition: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  scenarios: [
    {
      id: "baseline",
      name: "Baseline",
      scenarioParameters: [],
      parameterOverrides: {},
      initialState: { type: "per_place", content: {} },
    },
  ],
  metrics: [{ id: "throughput", name: "Throughput", code: "return 1;" }],
};
const proposal = {
  experiment: {
    name: "Baseline trial",
    scenarioId: "baseline",
    scenarioParameterValues: {},
    runCount: 20,
    seed: 42,
    dt: 1,
    maxTime: 1,
    metricIds: ["throughput"],
    execution: { mode: "simulate" as const },
  },
  declarations: [
    {
      subject: "result",
      statement: "Twenty runs do not establish a guarantee.",
    },
  ],
  unsupported: [],
};

test.each(["Dismiss", "Run"] as const)(
  "real LocalStorageDemoApp panel continues a host-authorized draft; %s stays out of Flue",
  async (action) => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    // Only the browser Worker boundary is emulated; Petrinaut and its assistant panel are real.
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
        addEventListener(
          _type: string,
          listener: (event: MessageEvent) => void,
        ) {
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
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("localStorage", {
      get length() {
        return 0;
      },
      clear() {},
      getItem: () => null,
      key: () => null,
      removeItem() {},
      setItem() {},
    } satisfies Storage);
    const baseId = ordinaryConstructionConversationIdFrom("incarnation");
    const binding = {
      conversationId: brunchEvaluationConversationIdFrom(baseId, "I"),
      documentId: "document",
      incarnationId: "incarnation",
    };
    fixture.binding = binding;
    fixture.baseBinding = { ...binding, conversationId: baseId };
    const documentRecord: DocumentRecord = {
      documentId: binding.documentId,
      incarnationId: binding.incarnationId,
      revisionId: "initial-revision",
      title: "Queue",
      definition,
      origin: { kind: "template", bundleKey: "fixture", fixtureVersion: "1" },
    };
    fixture.controller = {
      source: {
        repository: {
          records: [documentRecord],
          current: documentRecord,
          status: { state: "ready" },
          open() {},
          actions: {},
          persistRevision: async () => {},
          settleRevision: async () => {},
        },
        processAgentSeed: {
          documentId: binding.documentId,
          conversationId: baseId,
        },
      },
      createLocalAndOpen() {},
    };
    const handle = createJsonDocHandle({
      id: binding.documentId,
      initial: definition,
      initialRevisionId: documentRecord.revisionId,
    });
    const host = createCanonicalPetrinautHostTools({
      handle,
      binding,
      readTitle: () => "Queue",
      replayReadiness: {
        status: "ready",
        replay: EMPTY_CANONICAL_PETRINAUT_REPLAY,
      },
      settleRevision: async () => {},
    });
    const read = host.tools.find(
      (tool) => tool.toolName === "getLatestNetDefinition",
    );
    if (!read) throw new Error("No canonical read");
    const readOutput = read.execute({
      input: {},
      toolCallId: "read-1",
      handle,
      mutations: {} as never,
      commands: {} as never,
      readDiagnosticsContext: async () => "",
      viewport: { frameSceneAfterRender: async () => "framed" },
      signal: new AbortController().signal,
    });
    const readMetadata = await host.clientToolResultMetadataFor(
      "read-1",
      readOutput,
    );
    const markdown =
      "Decision: observe baseline throughput over one unit of time; do not claim a guarantee.";
    let history: FlueConversationState = {
      conversationId: binding.conversationId,
      settlements: [],
      messages: [
        {
          id: "assistant-ledger-read",
          display: "visible",
          role: "assistant",
          purpose: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolCallId: "ledger-1",
              toolName: "mutate_workpiece",
              state: "output-available",
              input: { markdown },
              output: {
                revisionId: "ledger-1",
                sha256: createHash("sha256").update(markdown).digest("hex"),
                ordinal: 1,
                disposition: "applied",
              },
            },
            {
              type: "dynamic-tool",
              toolCallId: "read-1",
              toolName: "getLatestNetDefinition",
              state: "output-available",
              input: {},
              output: {
                brunchBrowserResult: true,
                output: readOutput,
                metadata: readMetadata,
              },
            },
          ],
        },
        {
          id: "dispatch-read",
          display: "hidden",
          role: "system",
          purpose: "dispatch",
          signal: { tagName: "client-tool-result" },
          parts: [
            {
              type: "text",
              text: JSON.stringify([
                {
                  toolCallId: "read-1",
                  toolName: "getLatestNetDefinition",
                  output: readOutput,
                  metadata: readMetadata,
                },
              ]),
            },
          ],
        },
      ],
    } as FlueConversationState;
    const draftMessage = {
      id: "assistant-draft",
      display: "visible",
      role: "assistant",
      purpose: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolCallId: "draft-1",
          toolName: "draft_petrinaut_experiment",
          state: "output-available",
          input: proposal,
          output: { awaiting: "client" },
        },
      ],
    };
    await expect(
      resolveDraftAuthorityFromHistory(
        {
          ...history,
          messages: [...history.messages, draftMessage],
        } as FlueConversationState,
        binding,
        "draft-1",
      ),
    ).resolves.toBe("initial-revision");
    let submissionCount = 0;
    const send = vi.fn<FlueClient["send"]>(async () => ({
      submissionId: `submission-${++submissionCount}`,
      uid: "uid",
      offset: "1",
      streamUrl: "http://local.test/stream",
    }));
    const wait = vi.fn<FlueClient["wait"]>(async (admission, options) => {
      const submissionId = (admission as { submissionId: string }).submissionId;
      const messageId = `message-${submissionId}`;
      let index = 0;
      const position = () => ({ batch: 1, index: index++ });
      await options?.onEvent?.({
        type: "message-started",
        conversationId: binding.conversationId,
        submissionId,
        messageId,
        turnId: messageId,
        position: position(),
      });
      if (submissionId === "submission-1") {
        await options?.onEvent?.({
          type: "tool-input",
          conversationId: binding.conversationId,
          messageId,
          toolCallId: "draft-1",
          toolName: "draft_petrinaut_experiment",
          input: proposal,
          position: position(),
        });
        history = {
          ...history,
          messages: [...history.messages, draftMessage],
        } as FlueConversationState;
        await options?.onEvent?.({
          type: "tool-output",
          conversationId: binding.conversationId,
          toolCallId: "draft-1",
          output: { awaiting: "client" },
          position: position(),
        });
      } else {
        await options?.onEvent?.({
          type: "message-delta",
          conversationId: binding.conversationId,
          messageId,
          kind: "text",
          delta: "Draft prepared, not run.",
          position: position(),
        });
      }
      await options?.onEvent?.({
        type: "message-completed",
        conversationId: binding.conversationId,
        messageId,
        position: position(),
      });
      await options?.onEvent?.({
        type: "submission-settled",
        conversationId: binding.conversationId,
        submissionId,
        outcome: "completed",
        position: position(),
      });
    });
    const client = {
      history: async () => history,
      send,
      wait,
      observe: () => ({
        close() {},
        getSnapshot: () => ({
          phase: "ready",
          conversation: history,
          offset: "1",
        }),
        refresh() {},
        subscribe: () => () => {},
      }),
    } as unknown as FlueClient;
    fixture.client = client;
    render(
      <LocalStorageDemoApp
        search={{ bundle: "fixture" }}
        onSearchChange={() => {}}
      />,
    );
    const showPanel = await screen.findByRole("button", {
      name: "Show AI assistant",
    });
    fireEvent.click(showPanel);
    const composer = await screen.findByRole<HTMLTextAreaElement>("textbox", {
      name: "Message AI assistant",
    });
    fireEvent.change(composer, {
      target: { value: "Draft a baseline experiment." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    const card = await screen.findByRole("region", {
      name: "Drafted experiment",
    });
    await waitFor(() =>
      expect(card.getAttribute("data-draft-status")).not.toBe(
        "Preparing draft",
      ),
    );
    expect(card.textContent).toContain(
      "Drafted — not run · not saved with the document",
    );
    expect(
      screen.queryByRole("button", { name: /active Monte Carlo simulation/u }),
    ).toBeNull();
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    const delivery = send.mock.calls[1]?.[0].message;
    expect(delivery?.kind).toBe("signal");
    if (delivery?.kind !== "signal")
      throw new Error("Missing draft continuation signal");
    const results = JSON.parse(delivery.body) as {
      toolCallId: string;
      toolName: string;
      output: { status: string };
    }[];
    expect(results).toMatchObject([
      {
        toolCallId: "draft-1",
        toolName: "draft_petrinaut_experiment",
        output: { status: "drafted" },
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: action }));
    if (action === "Dismiss") {
      expect(card.getAttribute("data-draft-status")).toBe("Dismissed");
      expect(
        screen.queryByRole("button", {
          name: /active Monte Carlo simulation/u,
        }),
      ).toBeNull();
    } else {
      await waitFor(() =>
        expect(card.getAttribute("data-draft-status")).toBe("Run complete"),
      );
      expect(card.textContent).toContain("Finished");
      expect(card.textContent).toContain("20 runs");
    }
    expect(send).toHaveBeenCalledTimes(2);
  },
  30_000,
);
