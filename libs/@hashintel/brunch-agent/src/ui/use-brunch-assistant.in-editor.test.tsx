/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useMemo } from "react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import {
  createJsonDocHandle,
  type SDCPN,
  type PetrinautDocHandle,
} from "@hashintel/petrinaut-core";
import { ErrorTrackerContext } from "@hashintel/petrinaut/react";
import { Petrinaut } from "@hashintel/petrinaut/ui";

import {
  brunchEvaluationConversationIdFrom,
  ordinaryConstructionConversationIdFrom,
} from "../client/conversation/brunch-conversation-id";
import { BrunchAssistantContext } from "./editor-api-plugin";
import {
  InProcessLspWorker,
  NoopResizeObserver,
  preloadMonaco,
} from "./testing/petrinaut-jsdom";
import {
  createCanonicalPetrinautHostTools,
  EMPTY_CANONICAL_PETRINAUT_REPLAY,
} from "./tools/brunch-petrinaut-tools";
import { useBrunchAssistant } from "./use-brunch-assistant";

import type { FlueClient, FlueConversationState } from "@flue/sdk";

await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("./testing/petrinaut-jsdom");
  installPetrinautDomShims();
});
const fixture = vi.hoisted(() => ({ client: null as FlueClient | null }));
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
vi.mock("@flue/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flue/sdk")>()),
  createFlueClient: () => {
    if (!fixture.client) throw new Error("Missing test Flue client");
    return fixture.client;
  },
}));

const HookPanel = ({ handle }: { handle: PetrinautDocHandle }) => {
  const openDocument = useMemo(
    () => ({
      documentId: "document",
      editor: { handle, readTitle: () => "Queue" },
    }),
    [handle],
  );
  const brunch = useBrunchAssistant({
    ownerKey: "test-owner",
    chatEndpoint: "/agents/petrinaut",
    selected: true,
    openDocument,
    voice: { enabled: false, realtime: false },
    interviewBudget: { enabled: false, level: "off", setLevel: () => {} },
    words: { enabled: false },
    plugins: [],
  });
  return (
    <BrunchAssistantContext value={brunch.assistant}>
      <Petrinaut handle={handle} plugins={brunch.plugins} />
    </BrunchAssistantContext>
  );
};

beforeAll(preloadMonaco, 30_000);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // A lazy language-server import may finish after unmount; retain the Worker
  // stand-in until Vitest disposes this isolated file's jsdom environment.
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
  "the real Brunch hook panel settles a host-authorized draft in band; %s stays out of Flue",
  async (action) => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    // Only the browser Worker boundary is emulated; Petrinaut and its assistant panel are real.
    vi.stubGlobal("Worker", InProcessLspWorker);
    vi.stubGlobal("ResizeObserver", NoopResizeObserver);
    const stored = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      get length() {
        return stored.size;
      },
      clear: () => stored.clear(),
      getItem: (key: string) => stored.get(key) ?? null,
      key: (index: number) => [...stored.keys()][index] ?? null,
      removeItem: (key: string) => stored.delete(key),
      setItem: (key: string, value: string) => stored.set(key, value),
    } satisfies Storage);
    const baseId = ordinaryConstructionConversationIdFrom("document");
    const binding = {
      conversationId: brunchEvaluationConversationIdFrom(baseId),
      documentId: "document",
    };
    const handle = createJsonDocHandle({
      id: binding.documentId,
      initial: definition,
    });
    const host = createCanonicalPetrinautHostTools({
      handle,
      readTitle: () => "Queue",
      replayReadiness: {
        status: "ready",
        replay: EMPTY_CANONICAL_PETRINAUT_REPLAY,
      },
    });
    const read = host.tools.find(
      (tool) => tool.toolName === "getLatestNetDefinition",
    );
    if (!read) throw new Error("No canonical read");
    const readOutput = read.execute({
      input: {},
      toolCallId: "read-1",
      handle,
      // A read edits nothing.
      edit: {} as never,
      readDiagnosticsContext: async () => "",
      signal: new AbortController().signal,
    });
    const readMetadata = host.clientToolResultMetadataFor("read-1", readOutput);
    let history: FlueConversationState = {
      conversationId: binding.conversationId,
      settlements: [],
      messages: [
        {
          id: "assistant-read",
          display: "visible",
          role: "assistant",
          purpose: "assistant",
          parts: [
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
      ],
    } as FlueConversationState;
    const agentUrl = "http://local.test/agents/petrinaut/instance";
    const draftCallUrl = `${agentUrl}/browser-calls/draft-1`;
    // The server awaits the draft in band: the stream pauses until the browser
    // claims the issued call and posts its preparation.
    const draftResult = Promise.withResolvers<{
      output: { status: string };
    }>();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, init) => {
        const target = typeof url === "string" ? url : "";
        if (target.startsWith(`${draftCallUrl}?binding=`))
          return Response.json({
            capability: "capability",
            binding: new URL(target).searchParams.get("binding"),
            toolName: "draft_petrinaut_experiment",
            input: proposal,
          });
        if (target === draftCallUrl && typeof init?.body === "string") {
          draftResult.resolve(
            JSON.parse(init.body) as { output: { status: string } },
          );
          return Response.json({ settled: true });
        }
        if (target === "/api/voice/config")
          return Response.json({ available: false });
        throw new Error(`Unexpected fetch ${target}`);
      }),
    );
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
          state: "input-available",
          input: proposal,
        },
      ],
    };
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
        // Flue history carries the in-flight call while its tool runs.
        const prior = history.messages;
        history = {
          ...history,
          messages: [...prior, draftMessage],
        } as FlueConversationState;
        const settled = await draftResult.promise;
        const output = {
          brunchBrowserResult: true,
          output: settled.output,
        };
        history = {
          ...history,
          messages: [
            ...prior,
            {
              ...draftMessage,
              parts: [
                {
                  ...draftMessage.parts[0],
                  state: "output-available",
                  output,
                },
              ],
            },
          ],
        } as FlueConversationState;
        await options?.onEvent?.({
          type: "tool-output",
          conversationId: binding.conversationId,
          toolCallId: "draft-1",
          output,
          position: position(),
        });
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
      url: agentUrl,
      history: async () => history,
      send,
      wait,
      observe: () => ({
        close() {},
        getSnapshot: () => ({
          phase: "live",
          conversation: history,
          offset: "1",
        }),
        refresh() {},
        subscribe: () => () => {},
      }),
    } as unknown as FlueClient;
    fixture.client = client;
    render(
      <ErrorTrackerContext value={{ captureException: vi.fn() }}>
        <HookPanel handle={handle} />
      </ErrorTrackerContext>,
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
    // The preparation settles the issued call; no continuation signal is sent.
    expect((await draftResult.promise).output).toMatchObject({
      status: "drafted",
    });
    await screen.findByText("Draft prepared, not run.");
    expect(send).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: action }));
    if (action === "Dismiss") {
      expect(card.getAttribute("data-draft-status")).toBe("Dismissed");
      expect(
        screen.queryByRole("button", {
          name: /active Monte Carlo simulation/u,
        }),
      ).toBeNull();
      expect(send).toHaveBeenCalledTimes(1);
    } else {
      // The run is a real 20-run Monte Carlo experiment, slower on CI runners.
      await screen.findByText("Finished", {}, { timeout: 15_000 });
      expect(card.isConnected).toBe(false);
      expect(screen.getByText("20 runs")).not.toBeNull();
      // Only the finished run's result follow-up starts another turn.
      await waitFor(() => expect(send).toHaveBeenCalledTimes(2), {
        timeout: 15_000,
      });
    }
  },
  30_000,
);
