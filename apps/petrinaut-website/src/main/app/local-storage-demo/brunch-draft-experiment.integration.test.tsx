/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { use } from "react";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";

import { draftPetrinautExperimentToolName } from "@hashintel/brunch-agent-plugin-sdcpn";
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
  UserSettingsContext,
  UserSettingsProvider,
} from "@hashintel/petrinaut/react";
import { Petrinaut } from "@hashintel/petrinaut/ui";

import {
  batchedConstructionClientToolNames,
  brunchPetrinautDynamicToolNames,
} from "./brunch-client-tools";
import {
  createBrunchDraftExperimentInteractiveTool,
  resetBrunchDraftExperimentSession,
} from "./brunch-draft-experiment-interactive-tool";
import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
} from "./brunch-panel-transport";
import { createBrunchPetrinautTools } from "./brunch-petrinaut-tools";

import type { AgentSendResult, FlueClient } from "@flue/sdk";
import type { DraftPetrinautExperimentInput } from "@hashintel/brunch-agent-plugin-sdcpn";
import type { LspWorkerFactory, SDCPN } from "@hashintel/petrinaut-core";
import type {
  PetrinautConnectedOptimization,
  PetrinautOptimizationInput,
} from "@hashintel/petrinaut-core/optimization";
import type { PropsWithChildren } from "react";

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
  // Monaco's clipboard contrib reads this at import time; jsdom does not
  // implement it, and the lazy singleton can finish loading mid-suite.
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

const draftInput: DraftPetrinautExperimentInput = {
  observation: { toolCallId: "read-net-1", baseHash: "b".repeat(64) },
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
};

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

const EnableInBrowserOptimization = ({ children }: PropsWithChildren) => {
  const settings = use(UserSettingsContext);
  return (
    <UserSettingsContext
      value={{ ...settings, enableInBrowserOptimization: true }}
    >
      {children}
    </UserSettingsContext>
  );
};

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
  localStorage.setItem(
    "petrinaut:user-settings",
    JSON.stringify({ enableInBrowserOptimization: true }),
  );
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
  const handle = createJsonDocHandle({
    id: "draft-experiment-test",
    initial: supportDesk,
  });

  render(
    <UserSettingsProvider>
      <EnableInBrowserOptimization>
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
                createBrunchDraftExperimentInteractiveTool({
                  readTitle: () => "Support desk",
                }),
              ],
              conversationId: "test",
              requestStop: async () => "already-settled",
              transport: createBrunchPanelTransport(
                Promise.resolve(client),
                tracker,
                {
                  clientToolNames: batchedConstructionClientToolNames,
                  dynamicClientToolNames: brunchPetrinautDynamicToolNames,
                },
              ),
            }}
          />
        </PetrinautOptimizationContext>
      </EnableInBrowserOptimization>
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
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));

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
  expect(card.textContent).toContain("Vary agents 2–8 under Peak demand");
  expect(card.textContent).toContain("minimize Average waiting time");
  expect(card.textContent).toContain("No caller waits more than ten minutes.");
  expect(screen.getByRole("button", { name: "Run" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();

  // The prepared result went back to Brunch as a client-tool result, and the
  // follow-up turn rendered.
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
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

  // Nothing ran: the stock active-experiments indicator is absent, and the
  // card still offers Run.
  expect(
    screen.queryByRole("button", { name: /active Monte Carlo simulation/u }),
  ).toBeNull();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
  });
  await screen.findByRole("button", {
    name: "Show 1 active Monte Carlo simulations",
  });
  await screen.findByText("optimizing: 5/5 runs, step 2/3");
  await act(async () => {
    continueTrials.resolve();
  });
  await waitFor(() =>
    expect(card.getAttribute("data-draft-status")).toBe("Run complete"),
  );
  expect(
    screen.queryByRole("button", { name: /active Monte Carlo simulation/u }),
  ).toBeNull();
}, 30_000);
