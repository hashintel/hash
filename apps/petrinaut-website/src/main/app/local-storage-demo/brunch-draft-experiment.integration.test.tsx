/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";

import { draftPetrinautExperimentToolName } from "@hashintel/brunch-agent-plugin-sdcpn";
import { createJsonDocHandle } from "@hashintel/petrinaut-core";
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
      if (message.method !== "sdcpn/diagnostics" || !("id" in message)) return;
      queueMicrotask(() => {
        for (const listener of listeners) {
          listener({
            data: { jsonrpc: "2.0", id: message.id, result: [] },
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

beforeEach(() => {
  resetBrunchDraftExperimentSession();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("a streamed draft_petrinaut_experiment call renders the unrun card and reports drafted without starting an experiment", async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
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
    <Petrinaut
      handle={handle}
      lspWorkerFactory={cleanDiagnosticsWorker}
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
    />,
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
  expect(screen.getByRole("button", { name: "Run" })).toBeTruthy();
});
