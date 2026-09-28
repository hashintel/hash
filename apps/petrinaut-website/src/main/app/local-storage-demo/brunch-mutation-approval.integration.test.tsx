/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import {
  mutatePetrinetInputSchema,
  mutatePetrinetOutputSchema,
  mutatePetrinautNetToolName,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { createJsonDocHandle } from "@hashintel/petrinaut-core";
import {
  compileHirArtifacts,
  lowerScenarioToHir,
} from "@hashintel/petrinaut-core/hir";
import { createInProcessMonteCarloWorker } from "@hashintel/petrinaut-core/workers/monte-carlo";
import { UserSettingsProvider } from "@hashintel/petrinaut/react";
import { Petrinaut } from "@hashintel/petrinaut/ui";

import {
  batchedConstructionClientToolNames,
  brunchPetrinautDynamicToolNames,
} from "./brunch-client-tools";
import {
  createBrunchMutationApprovalCoordinator,
  createBrunchMutationApprovalInteractiveTool,
} from "./brunch-mutation-approval";
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
  class ClipboardItem {
    constructor(readonly items: Record<string, Blob | Promise<Blob>>) {}
  }
  Object.defineProperty(window, "ClipboardItem", {
    configurable: true,
    value: ClipboardItem,
  });
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
  Object.defineProperty(window, "CSS", {
    configurable: true,
    value: {
      ...window.CSS,
      escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "\\$&"),
    },
  });
});

beforeAll(async () => {
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
      if (message.method === "sdcpn/diagnostics") result = [];
      else if (message.method === "sdcpn/compileHirArtifacts")
        result = compileHirArtifacts(
          message.params.sdcpn,
          message.params.extensions,
          message.params.options,
        );
      else if (message.method === "sdcpn/lowerScenario")
        result = lowerScenarioToHir(message.params.scenario, {
          adHocContext: message.params.adHocContext,
        });
      else return;
      queueMicrotask(() => {
        for (const listener of listeners)
          listener({ data: { jsonrpc: "2.0", id: message.id, result } });
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

const initialNet: SDCPN = {
  places: [
    {
      id: "queue",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test.each(["Allow", "Deny"])(
  "the real panel applies %s and submits the mutation result once",
  async (choice) => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const handle = createJsonDocHandle({
      id: "approval-integration",
      initial: initialNet,
    });
    const mutationInput = mutatePetrinetInputSchema.parse({
      observation: {
        toolCallId: "read-1",
        baseHash: observeBrowserDefinition(handle).sha256,
      },
      bases: [
        {
          basisId: "basis-1",
          basis: { kind: "absent", reason: "Integration test" },
        },
      ],
      operations: [
        {
          operationId: "remove-queue",
          basisId: "basis-1",
          type: "removePlace",
          input: { placeId: "queue" },
        },
      ],
    });
    const releaseServerValidation = Promise.withResolvers<void>();
    const settleInitialStream = Promise.withResolvers<void>();
    const tracker = new BrunchPanelConversationTracker();
    const approval = createBrunchMutationApprovalCoordinator();
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
      let index = 0;
      const position = () => ({ batch: 1, index: index++ });
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
          toolCallId: "mutation-1",
          toolName: mutatePetrinautNetToolName,
          input: mutationInput,
          position: position(),
        });
        await releaseServerValidation.promise;
        await options?.onEvent?.({
          type: "tool-output",
          conversationId: "test",
          toolCallId: "mutation-1",
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
          delta: "The requested edit has been handled.",
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
    const binding = {
      conversationId: "test",
      documentId: handle.id,
      incarnationId: "incarnation",
    };
    const recorder = createJoinedBrowserMutationRecorder({ handle, binding });
    const approvalTool =
      createBrunchMutationApprovalInteractiveTool(approval).interactiveTool;

    render(
      <UserSettingsProvider>
        <Petrinaut
          handle={handle}
          lspWorkerFactory={cleanDiagnosticsWorker}
          monteCarloWorkerFactory={createInProcessMonteCarloWorker}
          aiAssistant={{
            automaticTools: createBrunchPetrinautTools({
              readTitle: () => "Queue",
              mutation: {
                approval,
                binding,
                retainAttempt: recorder.retainAttempt,
              },
            }),
            interactiveTools: [approvalTool],
            conversationId: "test",
            requestStop: async () => "already-settled",
            transport: createBrunchPanelTransport(
              Promise.resolve(client),
              tracker,
              {
                clientToolNames: batchedConstructionClientToolNames,
                dynamicClientToolNames: brunchPetrinautDynamicToolNames,
                validatedClientToolNames: recorder.validatedClientToolNames,
              },
            ),
          }}
        />
      </UserSettingsProvider>,
    );

    const show = await screen.findByRole("button", {
      name: "Show AI assistant",
    });
    await act(async () => fireEvent.click(show));
    const composer = await screen.findByRole("textbox", {
      name: "Message AI assistant",
    });
    fireEvent.change(composer, { target: { value: "Remove the queue." } });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Send message" })),
    );

    // Browser execution starts only after server validation releases the call.
    expect(handle.doc()?.places.map(({ id }) => id)).toEqual(["queue"]);
    await act(async () => releaseServerValidation.resolve());
    await act(async () => settleInitialStream.resolve());
    const approvalRegion = await screen.findByRole("region", {
      name: "Approve destructive edits",
    });
    expect(screen.getByRole("button", { name: "Allow" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Always allow" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deny" })).toBeTruthy();
    expect(approvalRegion.textContent).toContain("Remove place — queue");
    expect(handle.doc()?.places.map(({ id }) => id)).toEqual(["queue"]);
    expect(send).toHaveBeenCalledTimes(1);

    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: choice })),
    );
    await waitFor(() =>
      expect(handle.doc()?.places.map(({ id }) => id)).toEqual(
        choice === "Allow" ? [] : ["queue"],
      ),
    );
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    const followUp = send.mock.calls[1]![0].message;
    expect(followUp.kind).toBe("signal");
    const results = JSON.parse((followUp as { body: string }).body) as Array<{
      toolCallId: string;
      toolName: string;
      output: unknown;
    }>;
    expect(results).toHaveLength(1);
    expect(results[0]?.toolCallId).toBe("mutation-1");
    expect(results[0]?.toolName).toBe(mutatePetrinautNetToolName);
    const output = mutatePetrinetOutputSchema.parse(results[0]?.output);
    expect(output.outcomes).toMatchObject([
      {
        operationId: "remove-queue",
        status: choice === "Allow" ? "applied" : "failed",
      },
    ]);
    expect(results[0]?.output).not.toEqual({ decision: "allow" });

    await screen.findByText("The requested edit has been handled.");
    expect(send).toHaveBeenCalledTimes(2);
  },
  30_000,
);
