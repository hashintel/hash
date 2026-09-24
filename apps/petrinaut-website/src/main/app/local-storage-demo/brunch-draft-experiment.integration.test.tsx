/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";

import {
  type DraftPetrinautExperimentInput,
  type DraftPetrinautExperimentOutput,
  draftPetrinautExperimentInputSchema,
  draftPetrinautExperimentOutputSchema,
  draftPetrinautExperimentToolName,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { createJsonDocHandle } from "@hashintel/petrinaut-core";
import {
  compileHirArtifacts,
  lowerScenarioToHir,
} from "@hashintel/petrinaut-core/hir";
import { resolveTrialScenarioParameterValues } from "@hashintel/petrinaut-core/optimization";
import { createInProcessMonteCarloWorker } from "@hashintel/petrinaut-core/workers/monte-carlo";
import {
  type OptimizationBest,
  PetrinautOptimizationContext,
  UserSettingsProvider,
} from "@hashintel/petrinaut/react";
import {
  definePetrinautAiInteractiveTool,
  Petrinaut,
  type PetrinautAiInteractiveToolWidgetProps,
} from "@hashintel/petrinaut/ui";

import {
  batchedConstructionClientToolNames,
  brunchPetrinautDynamicToolNames,
} from "./brunch-client-tools";
import {
  BrunchDraftExperimentWidget,
  resetBrunchDraftExperimentSession,
} from "./brunch-draft-experiment-interactive-tool";
import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
} from "./brunch-panel-transport";
import { createBrunchPetrinautTools } from "./brunch-petrinaut-tools";
import {
  createJoinedBrowserMutationRecorder,
  observeBrowserDefinition,
} from "./mutation-record";

import type { AgentSendResult, FlueClient } from "@flue/sdk";
import type { LspWorkerFactory, SDCPN } from "@hashintel/petrinaut-core";
import type {
  PetrinautConnectedOptimization,
  PetrinautOptimizationInput,
} from "@hashintel/petrinaut-core/optimization";

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
  // Monaco installs a WebKit clipboard workaround on macOS and reads these
  // browser APIs at import time; jsdom does not implement them.
  Object.defineProperty(document, "queryCommandSupported", {
    configurable: true,
    value: () => false,
  });
  class ClipboardItem {
    constructor(readonly items: Record<string, Blob | Promise<Blob>>) {}
  }
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      // Adopt deferred contents as a real clipboard write would, so Monaco
      // handles their cancellation when another user gesture replaces them.
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
  Object.defineProperty(window, "CSS", {
    configurable: true,
    value: {
      ...window.CSS,
      escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "\\$&"),
    },
  });
});

beforeAll(async () => {
  // The real panel loads Monaco lazily; settle its import before the test.
  await import("monaco-editor");
}, 30_000);

type LspWorker = Awaited<ReturnType<LspWorkerFactory>>;
type LspWorkerMessage = Parameters<LspWorker["postMessage"]>[0];
type LspWorkerListener = Parameters<LspWorker["addEventListener"]>[1];

const cleanDiagnosticsWorker: LspWorkerFactory = () => {
  const listeners = new Set<LspWorkerListener>();
  return {
    postMessage(message: LspWorkerMessage) {
      if (!("id" in message)) return;
      let result: unknown;
      if (message.method === "sdcpn/diagnostics") {
        result = [];
      } else if (message.method === "sdcpn/compileHirArtifacts") {
        result = compileHirArtifacts(
          message.params.sdcpn,
          message.params.extensions,
          message.params.options,
        );
      } else if (message.method === "sdcpn/lowerScenario") {
        result = lowerScenarioToHir(message.params.scenario, {
          adHocContext: message.params.adHocContext,
        });
      } else {
        return;
      }
      queueMicrotask(() => {
        for (const listener of listeners) {
          listener({
            data: { jsonrpc: "2.0", id: message.id, result },
          });
        }
      });
    },
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
    terminate() {
      listeners.clear();
    },
  };
};

const supportDesk: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
  scenarios: [
    {
      id: "scenario__peak_demand",
      name: "Peak demand",
      scenarioParameters: [
        { identifier: "agents", type: "integer", default: 4 },
      ],
      parameterOverrides: {},
      initialState: { type: "per_place", content: {} },
    },
  ],
  metrics: [
    {
      id: "metric__average_waiting_time",
      name: "Average waiting time",
      code: "return 1;",
    },
  ],
};

const draftInputFor = (baseHash: string): DraftPetrinautExperimentInput => ({
  observation: { toolCallId: "read-net-1", baseHash },
  experiment: {
    name: "Staffing under peak demand",
    scenarioId: "scenario__peak_demand",
    scenarioParameterValues: { agents: { mode: "range", min: 2, max: 8 } },
    runCount: 20,
    seed: 7,
    dt: 1,
    maxTime: 120,
    metricIds: ["metric__average_waiting_time"],
    execution: {
      mode: "optimize",
      objectiveMetricId: "metric__average_waiting_time",
      direction: "minimize",
      steps: 3,
      runsPerStep: 5,
    },
  },
  declarations: [
    {
      subject: "maxTime",
      statement: "Minutes; the two-hour peak window is 120 minutes.",
    },
  ],
  basis: {
    kind: "declared",
    revisionId: "revision-1",
    sha256: "c".repeat(64),
    locators: [{ start: 0, end: 12 }],
    rationale: "The Ledger settles the staffing decision and its range.",
    scope: "operation",
  },
  unsupported: [
    {
      condition: "No caller waits more than ten minutes.",
      reason:
        "The person accepted reporting-only exploration; the request carries no constraints.",
      blocksRun: false,
    },
  ],
});

type ObservedDraftWidgetProps = PetrinautAiInteractiveToolWidgetProps<
  DraftPetrinautExperimentInput,
  DraftPetrinautExperimentOutput
> & {
  onSubmitted: () => void;
};

const ObservedDraftWidget = ({
  onSubmitted,
  ...widgetProps
}: ObservedDraftWidgetProps) => {
  useEffect(() => {
    if (widgetProps.state === "submitted") {
      onSubmitted();
    }
  }, [onSubmitted, widgetProps.state]);

  return (
    <BrunchDraftExperimentWidget
      {...widgetProps}
      readTitle={() => "Support desk"}
    />
  );
};

const createObservedDraftTool = (onSubmitted: () => void) =>
  definePetrinautAiInteractiveTool<
    DraftPetrinautExperimentInput,
    DraftPetrinautExperimentOutput
  >({
    toolName: draftPetrinautExperimentToolName,
    placement: "card",
    inputSchema: draftPetrinautExperimentInputSchema,
    outputSchema: draftPetrinautExperimentOutputSchema,
    component: (props) => (
      <ObservedDraftWidget {...props} onSubmitted={onSubmitted} />
    ),
  });

const createControlledOptimization = (
  continueAfterFirstTrial: Promise<void>,
): PetrinautConnectedOptimization => ({
  kind: "connected",
  connect: (channel) => {
    let manifest: PetrinautOptimizationInput | null = null;
    return {
      createOptimizationRun: async (input) => {
        manifest = input;
        return { runId: "run-integration" };
      },
      async *attachOptimizationRun(runId, options) {
        if (manifest === null) {
          throw new Error("The optimization manifest was not captured.");
        }
        let best: OptimizationBest | null = null;
        let seq = 0;
        const agentCounts = [2, 5, 8];
        for (const [trial, agents] of agentCounts.entries()) {
          const suggestedValues = { agents };
          const outcome = await channel.evaluateTrial({
            runId,
            trial,
            manifest,
            suggestedValues,
            scenarioParameterValues: resolveTrialScenarioParameterValues(
              manifest,
              suggestedValues,
            ),
            seeds: Array.from(
              { length: manifest.execution.seedsPerTrial ?? 1 },
              (_, index) => index + 1,
            ),
            signal: options?.signal ?? new AbortController().signal,
          });
          if (outcome.kind !== "objective") {
            throw new Error(`Trial ${trial} did not produce an objective.`);
          }
          best ??= {
            trial,
            parameters: suggestedValues,
            objective: outcome.objective,
          };
          seq += 1;
          yield {
            type: "trial",
            trial,
            parameters: suggestedValues,
            objective: outcome.objective,
            state: "complete",
            best,
            seq,
          };
          if (trial === 0) {
            await continueAfterFirstTrial;
          }
        }
        yield {
          type: "complete",
          requestedTrials: agentCounts.length,
          completedTrials: agentCounts.length,
          prunedTrials: 0,
          failedTrials: 0,
          best,
          resumable: true,
          seq: seq + 1,
        };
      },
      cancelOptimizationRun: async () => {},
      extendOptimizationRun: async () => {},
      releaseOptimizationRun: async () => {},
      dispose: () => {},
    };
  },
});

beforeEach(() => {
  const entries = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()].at(index) ?? null,
    removeItem: (key: string) => entries.delete(key),
    setItem: (key: string, value: string) => entries.set(key, value),
  } satisfies Storage);
  resetBrunchDraftExperimentSession();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("a streamed experiment draft stays idle until Run, then uses the stock host progress path", async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const continueTrials = Promise.withResolvers<void>();
  const availableOptimization = createControlledOptimization(
    continueTrials.promise,
  );
  const handle = createJsonDocHandle({
    id: "draft-experiment-test",
    initial: supportDesk,
  });
  const draftInput = draftInputFor(observeBrowserDefinition(handle).sha256);
  const serverValidationPending = Promise.withResolvers<void>();
  const releaseServerValidation = Promise.withResolvers<void>();
  const settleInitialStream = Promise.withResolvers<void>();
  const toolOutputSubmitted = Promise.withResolvers<void>();
  const tracker = new BrunchPanelConversationTracker();
  const send = vi.fn<FlueClient["send"]>(
    async (): Promise<AgentSendResult> => ({
      submissionId: `submission-${send.mock.calls.length}`,
      uid: "uid",
      offset: "0",
      streamUrl: "http://local.test/agents/chat/test/stream",
    }),
  );
  const wait = vi.fn<FlueClient["wait"]>(async (admission, options) => {
    const submissionId = (admission as AgentSendResult).submissionId;
    const messageId = `assistant-${submissionId}`;
    let ordinal = 0;
    const position = () => ({ batch: 1, index: ordinal++ });
    await options?.onEvent?.({
      type: "message-started",
      conversationId: "test",
      submissionId,
      messageId,
      turnId: messageId,
      position: position(),
    });
    if (submissionId === "submission-1") {
      await options?.onEvent?.({
        type: "tool-input",
        conversationId: "test",
        messageId,
        toolCallId: "draft-1",
        toolName: draftPetrinautExperimentToolName,
        input: draftInput,
        position: position(),
      });
      serverValidationPending.resolve();
      await releaseServerValidation.promise;
      await options?.onEvent?.({
        type: "tool-output",
        conversationId: "test",
        toolCallId: "draft-1",
        output: { awaiting: "client" },
        position: position(),
      });
      await settleInitialStream.promise;
    } else {
      await options?.onEvent?.({
        type: "message-delta",
        conversationId: "test",
        messageId,
        kind: "text",
        delta: "Drafted; press Run when you want it started.",
        position: position(),
      });
    }
    await options?.onEvent?.({
      type: "message-completed",
      conversationId: "test",
      messageId,
      position: position(),
    });
    await options?.onEvent?.({
      type: "submission-settled",
      conversationId: "test",
      submissionId,
      outcome: "completed",
      position: position(),
    });
  });
  const client = { send, wait } as Pick<
    FlueClient,
    "send" | "wait"
  > as FlueClient;
  const mutationRecorder = createJoinedBrowserMutationRecorder({
    handle,
    binding: {
      conversationId: "test",
      documentId: handle.id,
      incarnationId: "incarnation",
    },
  });

  render(
    <UserSettingsProvider>
      <PetrinautOptimizationContext value={availableOptimization}>
        <Petrinaut
          handle={handle}
          lspWorkerFactory={cleanDiagnosticsWorker}
          monteCarloWorkerFactory={createInProcessMonteCarloWorker}
          aiAssistant={{
            automaticTools: createBrunchPetrinautTools({
              readTitle: () => "Support desk",
            }),
            interactiveTools: [
              createObservedDraftTool(toolOutputSubmitted.resolve),
            ],
            conversationId: "test",
            requestStop: async () => "already-settled",
            transport: createBrunchPanelTransport(
              Promise.resolve(client),
              tracker,
              {
                clientToolNames: batchedConstructionClientToolNames,
                dynamicClientToolNames: brunchPetrinautDynamicToolNames,
                validatedClientToolNames:
                  mutationRecorder.validatedClientToolNames,
              },
            ),
          }}
        />
      </PetrinautOptimizationContext>
    </UserSettingsProvider>,
  );

  const showPanel = await screen.findByRole("button", {
    name: "Show AI assistant",
  });
  await act(async () => fireEvent.click(showPanel));
  const composer = await screen.findByRole<HTMLTextAreaElement>("textbox", {
    name: "Message AI assistant",
  });
  fireEvent.change(composer, {
    target: { value: "We need to decide how many agents to schedule." },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  });

  await serverValidationPending.promise;
  await act(async () => {});
  expect(
    screen.queryByRole("region", { name: "Drafted experiment" }),
  ).toBeNull();

  // Release the browser input only after Brunch has accepted the draft, then
  // hold the first response open until its host-owned widget has submitted.
  // This is the ordering that used to let AI SDK's stream-end continuation
  // race Petrinaut's ready-state continuation.
  await act(async () => releaseServerValidation.resolve());
  await toolOutputSubmitted.promise;
  await act(async () => settleInitialStream.resolve());

  // The card is rendered inside Petrinaut's tree, prepared against the live
  // model, and reads as drafted with Run available.
  const card = await screen.findByRole("region", {
    name: "Drafted experiment",
  });
  await waitFor(() =>
    expect(card.getAttribute("data-draft-status")).toBe(
      "Drafted — not run · not saved with the document",
    ),
  );
  const simulate = screen.getByRole<HTMLInputElement>("radio", {
    name: "Simulate",
  });
  expect(simulate.checked).toBe(false);
  expect(
    document.querySelector("[data-draft-experiment-indicator]"),
  ).toBeNull();
  expect(card.textContent).toContain("Vary agents 2–8 under Peak demand");
  expect(card.textContent).toContain("minimize Average waiting time");
  expect(card.textContent).toContain("No caller waits more than ten minutes.");
  expect(screen.getByRole("button", { name: "Run" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();

  // The prepared result went back to Brunch as a client-tool result, and the
  // follow-up turn rendered.
  await waitFor(() => expect(send.mock.calls.length).toBeGreaterThanOrEqual(2));
  const followUp = send.mock.calls[1]![0].message;
  expect(followUp.kind).toBe("signal");
  const results = JSON.parse((followUp as { body: string }).body) as Array<{
    toolCallId: string;
    toolName: string;
    output: unknown;
  }>;
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({
    toolCallId: "draft-1",
    toolName: draftPetrinautExperimentToolName,
    output: { status: "drafted" },
  });
  expect((results[0]!.output as { diagnostics: string[] }).diagnostics).toEqual(
    [
      "No constraints or constraint policy are carried; nothing is enforced.",
      "Not carried: No caller waits more than ten minutes.",
    ],
  );
  await screen.findByText("Drafted; press Run when you want it started.");
  expect(send).toHaveBeenCalledTimes(2);

  // Nothing ran: the stock active-experiments indicator is absent, and the
  // card still offers Run.
  expect(
    screen.queryByRole("button", { name: /active Monte Carlo simulation/u }),
  ).toBeNull();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
  });
  expect(simulate.checked).toBe(false);
  await screen.findByRole("button", {
    name: "Show 1 active Monte Carlo simulations",
  });
  await screen.findByText("Step 2 of 3");
  expect(
    screen
      .getByRole("progressbar", { name: "Experiment runs" })
      .getAttribute("aria-valuenow"),
  ).toBe("5");
  await act(async () => {
    continueTrials.resolve();
  });
  await screen.findByText("Finished");
  expect(card.isConnected).toBe(false);
  expect(
    screen.queryByRole("button", { name: /active Monte Carlo simulation/u }),
  ).toBeNull();
  expect(screen.getByRole("radio", { name: "Simulate" })).toBe(simulate);
  expect(simulate.checked).toBe(false);
  expect(send).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: /View experiment/u }));
  await waitFor(() => expect(simulate.checked).toBe(true));
  expect(send).toHaveBeenCalledTimes(2);
}, 30_000);
