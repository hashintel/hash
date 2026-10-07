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
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
} from "@hashintel/petrinaut-core";
import { PetrinautAssistantWindowPreview } from "@hashintel/petrinaut/ui";

import { AssistantChat } from "../../_shared/chat/assistant-chat";
import { definePetrinautAiInteractiveTool } from "../../_shared/chat/interactive-tool";
import { createTestPluginApi } from "../../_shared/testing/create-test-plugin-api";
import { useFlueChatHistory } from "./use-flue-chat-history";

import type { PetrinautAiTransport } from "../../_shared/chat/ai-message";
import type { PetrinautAiVoiceModeContext } from "../../_shared/chat/composer-control";
import type {
  AgentConversationObservation,
  AgentConversationObservationSnapshot,
  FlueClient,
} from "@flue/sdk";

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
  // Monaco probes legacy clipboard support at import time; jsdom has no
  // implementation. This fixture does not exercise clipboard operations.
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
      // Monaco's macOS gesture handler supplies deferred data. Adopt it so
      // cancellation propagates to the handler rather than becoming unhandled.
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
  // Monaco's theme service escapes icon class names when it initializes.
  Object.defineProperty(window, "CSS", {
    configurable: true,
    value: {
      ...window.CSS,
      escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "\\$&"),
    },
  });
});

beforeAll(async () => {
  // Settle the real editor's import and theme setup before mounting so errors
  // cannot race the history assertions or escape after the test finishes.
  const monaco = await import("monaco-editor");
  monaco.editor.setTheme("vs");
}, 30_000);

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
  transport: PetrinautAiTransport;
}) => {
  const [api] = useState(() =>
    createTestPluginApi(
      createPetrinaut({
        document: createJsonDocHandle({
          id: handleId,
          initial: emptyDefinition,
        }),
      }),
    ),
  );
  const history = useFlueChatHistory(
    clientPromise,
    conversationId,
    voiceClientToolNames,
  );
  if (!history.ready || history.messages === undefined) return null;
  return (
    <PetrinautAssistantWindowPreview>
      <AssistantChat
        api={api}
        conversationId={conversationId}
        interactiveTools={[voiceAnswerTool]}
        messages={history.messages}
        requestStop={requestStop}
        renderVoiceMode={(context) => (
          <VoiceMode context={context} endVoice={endVoice} />
        )}
        transport={transport}
      />
    </PetrinautAssistantWindowPreview>
  );
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("projects typed, in-band tool, and stopped fixture history after remount", async () => {
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
              output: {
                brunchBrowserResult: true,
                output: { answer: "The supervisor" },
              },
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
  const transport: PetrinautAiTransport = {
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

  render(
    <ContinuityPanel
      clientPromise={observation.clientPromise}
      endVoice={endVoice}
      handleId="voice-continuity-mount-b"
      requestStop={requestStop}
      transport={transport}
    />,
  );
  await screen.findByText("Typed planning note");
  expect(observation.observe).toHaveBeenCalledTimes(2);
  expect(screen.getByText("voice-tool-1: The supervisor")).not.toBeNull();
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
