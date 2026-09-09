/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, expect, test, vi } from "vitest";

import { CLIENT_TOOL_RESULT_SIGNAL } from "@hashintel/brunch-agent-transport-aisdk";
import { createJsonDocHandle } from "@hashintel/petrinaut-core";
import {
  definePetrinautAiInteractiveTool,
  Petrinaut,
} from "@hashintel/petrinaut/ui";

import { useFlueChatHistory } from "./use-flue-chat-history";

import type {
  AgentConversationObservation,
  AgentConversationObservationSnapshot,
  FlueClient,
} from "@flue/sdk";
import type {
  PetrinautAiChatTransport,
  PetrinautAiVoiceModeContext,
} from "@hashintel/petrinaut/ui";

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
});

const conversationId = "voice-continuity";
const voiceAnswerToolName = "answerQuestion";
const voiceClientToolNames = new Set([voiceAnswerToolName]);
const voiceAnswerTool = definePetrinautAiInteractiveTool({
  component: ({ submittedOutput, toolCallId }) => (
    <span>{`${toolCallId}: ${submittedOutput?.answer}`}</span>
  ),
  inputSchema: {
    parse: (raw: unknown) => raw as { question: string },
  },
  outputSchema: {
    parse: (raw: unknown) => raw as { answer: string },
  },
  toolName: voiceAnswerToolName,
});
const emptyDefinition = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};
const inertWorker = () => ({
  addEventListener() {},
  postMessage() {},
  removeEventListener() {},
  terminate() {},
});

const createObservationHarness = (
  initialSnapshot: AgentConversationObservationSnapshot,
) => {
  let snapshot = initialSnapshot;
  const activeListeners = new Set<Set<() => void>>();
  const observe = vi.fn((): AgentConversationObservation => {
    const listeners = new Set<() => void>();
    activeListeners.add(listeners);
    return {
      close: () => activeListeners.delete(listeners),
      getSnapshot: () => snapshot,
      refresh: vi.fn(),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  });
  return {
    clientPromise: Promise.resolve({
      observe,
    } as Pick<FlueClient, "observe"> as FlueClient),
    observe,
    publish(nextSnapshot: AgentConversationObservationSnapshot) {
      snapshot = nextSnapshot;
      for (const listeners of activeListeners) {
        for (const listener of listeners) listener();
      }
    },
  };
};

const VoiceMode = ({
  context,
  endVoice,
}: {
  context: PetrinautAiVoiceModeContext;
  endVoice: () => Promise<void>;
}) => {
  const {
    inputMode,
    registerVoiceModeControls,
    reportVoiceSessionState,
    setVoiceActive,
  } = context;
  useEffect(
    () =>
      registerVoiceModeControls({
        end: endVoice,
        pause: vi.fn(),
        reconnect: vi.fn(),
        resume: vi.fn(),
        setMicrophoneMuted: vi.fn(),
      }),
    [endVoice, registerVoiceModeControls],
  );
  useEffect(() => {
    if (inputMode !== "voice") return;
    setVoiceActive(true);
    reportVoiceSessionState({
      errorMessage: null,
      microphoneLevel: 0,
      microphoneMuted: false,
      phase: "listening",
    });
  }, [inputMode, reportVoiceSessionState, setVoiceActive]);
  return null;
};

const ContinuityPanel = ({
  clientPromise,
  endVoice,
  handleId,
  requestStop,
  transport,
}: {
  clientPromise: Promise<FlueClient>;
  endVoice: () => Promise<void>;
  handleId: string;
  requestStop: () => Promise<"already-settled" | "stop-requested">;
  transport: PetrinautAiChatTransport;
}) => {
  const [handle] = useState(() =>
    createJsonDocHandle({
      id: handleId,
      initial: emptyDefinition,
    }),
  );
  const history = useFlueChatHistory(
    clientPromise,
    conversationId,
    voiceClientToolNames,
  );
  if (!history.ready || history.messages === undefined) return null;
  return (
    <Petrinaut
      aiAssistant={{
        conversationId,
        interactiveTools: [voiceAnswerTool],
        messages: history.messages,
        requestStop,
        renderVoiceMode: (context) => (
          <VoiceMode context={context} endVoice={endVoice} />
        ),
        transport,
      }}
      handle={handle}
      lspWorkerFactory={inertWorker}
    />
  );
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("projects typed, Voice-tool, and stopped fixture history after remount", async () => {
  const storageEntries = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    get length() {
      return storageEntries.size;
    },
    clear: () => storageEntries.clear(),
    getItem: (key: string) => storageEntries.get(key) ?? null,
    key: (index: number) => [...storageEntries.keys()].at(index) ?? null,
    removeItem: (key: string) => storageEntries.delete(key),
    setItem: (key: string, value: string) => storageEntries.set(key, value),
  } satisfies Storage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const initialSnapshot: AgentConversationObservationSnapshot = {
    conversation: {
      conversationId,
      messages: [
        {
          display: "visible",
          id: "typed-user",
          parts: [{ state: "done", text: "Typed planning note", type: "text" }],
          purpose: "user",
          role: "user",
        },
        {
          display: "visible",
          id: "voice-tool-response",
          parts: [
            {
              input: { question: "Who approves this?" },
              output: { awaiting: "client" },
              state: "output-available",
              toolCallId: "voice-tool-1",
              toolName: voiceAnswerToolName,
              type: "dynamic-tool",
            },
          ],
          purpose: "assistant",
          role: "assistant",
          submissionId: "voice-submission",
        },
        {
          display: "hidden",
          id: "voice-tool-result",
          parts: [
            {
              state: "done",
              text: JSON.stringify([
                {
                  output: { answer: "The supervisor" },
                  source: "voice",
                  toolCallId: "voice-tool-1",
                  toolName: voiceAnswerToolName,
                },
              ]),
              type: "text",
            },
          ],
          purpose: "dispatch",
          role: "system",
          signal: { tagName: CLIENT_TOOL_RESULT_SIGNAL },
        },
      ],
      settlements: [{ outcome: "completed", submissionId: "voice-submission" }],
    },
    error: undefined,
    offset: "before-stop",
    phase: "live",
  };
  const stoppedSnapshot: AgentConversationObservationSnapshot = {
    conversation: {
      conversationId,
      messages: [
        ...initialSnapshot.conversation!.messages,
        {
          display: "visible",
          id: "stop-user",
          parts: [
            {
              state: "done",
              text: "Start a stoppable response",
              type: "text",
            },
          ],
          purpose: "user",
          role: "user",
        },
        {
          display: "visible",
          id: "stopped-response",
          parts: [
            {
              state: "done",
              text: "Durably interrupted response",
              type: "text",
            },
          ],
          purpose: "assistant",
          role: "assistant",
          submissionId: "stop-submission",
        },
      ],
      settlements: [
        ...initialSnapshot.conversation!.settlements,
        { outcome: "aborted", submissionId: "stop-submission" },
      ],
    },
    error: undefined,
    offset: "after-stop",
    phase: "live",
  };
  const observation = createObservationHarness(initialSnapshot);
  const endVoice = vi.fn(async () => undefined);
  const transport: PetrinautAiChatTransport = {
    reconnectToStream: () => Promise.resolve(null),
    sendMessages: vi.fn(() =>
      Promise.resolve(
        new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "start-step" });
            controller.enqueue({ id: "partial", type: "text-start" });
            controller.enqueue({
              delta: "Durably interrupted response",
              id: "partial",
              type: "text-delta",
            });
          },
          cancel() {},
        }),
      ),
    ),
  };
  const requestStop = vi.fn(async () => {
    observation.publish(stoppedSnapshot);
    return "stop-requested" as const;
  });

  const firstMount = render(
    <ContinuityPanel
      clientPromise={observation.clientPromise}
      endVoice={endVoice}
      handleId="voice-continuity-mount-a"
      requestStop={requestStop}
      transport={transport}
    />,
  );
  const showFirstPanel = await screen.findByRole("button", {
    name: "Show AI assistant",
  });
  await act(async () => fireEvent.click(showFirstPanel));
  const composer = await screen.findByRole<HTMLTextAreaElement>("textbox", {
    name: "Message AI assistant",
  });
  fireEvent.change(composer, {
    target: { value: "Start a stoppable response" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await screen.findByText("Durably interrupted response");
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Stop AI response" })),
  );
  await waitFor(() => expect(requestStop).toHaveBeenCalledOnce());
  firstMount.unmount();

  const secondMount = render(
    <ContinuityPanel
      clientPromise={observation.clientPromise}
      endVoice={endVoice}
      handleId="voice-continuity-mount-b"
      requestStop={requestStop}
      transport={transport}
    />,
  );
  const showSecondPanel = await screen.findByRole("button", {
    name: "Show AI assistant",
  });
  await act(async () => fireEvent.click(showSecondPanel));
  await screen.findByText("Typed planning note");
  expect(observation.observe).toHaveBeenCalledTimes(2);
  expect(
    within(
      screen.getByText("Typed planning note").closest("[data-role]")!,
    ).queryByTestId("voice-input-provenance"),
  ).toBeNull();
  expect(
    within(
      secondMount.container.querySelector(
        '[data-tool-call-id="voice-tool-1"]',
      )!,
    ).getByTestId("voice-input-provenance"),
  ).not.toBeNull();
  expect(screen.getByText("Durably interrupted response")).not.toBeNull();
  expect(screen.getByText("Response stopped")).not.toBeNull();

  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Start voice mode" })),
  );
  const voiceDock = await screen.findByRole("region", {
    name: "Voice session",
  });
  fireEvent.click(
    within(voiceDock).getByRole("button", { name: "End voice mode" }),
  );

  await waitFor(() => expect(endVoice).toHaveBeenCalledOnce());
  expect(requestStop).toHaveBeenCalledOnce();
});
