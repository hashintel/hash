/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  createJsonDocHandle,
  createPetrinaut,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { PetrinautInstanceContext } from "../../../../react/instance-context";
import { NotificationsProvider } from "../../../../react/notifications/provider";
import {
  EditorContext,
  initialEditorState,
  type EditorContextValue,
} from "../../../../react/state/editor-context";
import {
  SDCPNContext,
  type SDCPNContextValue,
} from "../../../../react/state/sdcpn-context";
import { definePetrinautAiInteractiveTool } from "../../../types/ai-interactive-tool";
import { addMappedToolOutput, AiAssistantPanel } from "./ai-assistant-panel";

import type { PetrinautAiAssistant } from "../../../petrinaut";
import type {
  PetrinautAiComposerControlContext,
  PetrinautAiInputMode,
  PetrinautAiVoiceModeContext,
} from "../../../types/ai-assistant-composer-control";
import type {
  PetrinautAiMessage,
  PetrinautAiTransport,
} from "./ai-assistant-panel/types";
import type { UIMessageChunk } from "ai";

let voiceModeMounts = 0;
let voiceModeUnmounts = 0;

const emptySDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
  subnets: [],
  componentInstances: [],
};

const nonEmptySDCPN: SDCPN = {
  ...emptySDCPN,
  places: [
    {
      id: "place-1",
      name: "PlaceOne",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
};

const editorContextValue: EditorContextValue = {
  ...initialEditorState,
  isAiAssistantOpen: true,
  navigateTo: () => {},
  setGlobalMode: () => {},
  setEditionMode: () => {},
  setAddComponentMode: () => {},
  setCursorMode: () => {},
  setLeftSidebarOpen: () => {},
  setLeftSidebarWidth: () => {},
  setPropertiesPanelWidth: () => {},
  setAiAssistantWidth: () => {},
  setBottomPanelOpen: () => {},
  toggleBottomPanel: () => {},
  setBottomPanelHeight: () => {},
  setActiveBottomPanelTab: () => {},
  isSelected: () => false,
  isSelectedConnection: () => false,
  isNotSelectedConnection: () => false,
  selectedConnections: new Map(),
  setSelection: () => {},
  beginSelectionGesture: () => {},
  endSelectionGesture: () => {},
  selectItem: () => {},
  toggleItem: () => {},
  clearSelection: () => {},
  setHoveredItem: () => {},
  clearHoveredItem: () => {},
  isHovered: () => false,
  isHoveredConnection: () => false,
  isNotHoveredConnection: () => false,
  setDraggingStateByNodeId: () => {},
  updateDraggingStateByNodeId: () => {},
  resetDraggingState: () => {},
  collapseAllPanels: () => {},
  setTimelineChartType: () => {},
  setTimelineView: () => {},
  setHiddenTimelineSeriesIds: () => {},
  setSimulateViewMode: () => {},
  setSimulateDrawer: () => {},
  setSearchOpen: () => {},
  setAiAssistantOpen: () => {},
  toggleAiAssistant: () => {},
  searchInputRef: { current: null },
  triggerPanelAnimation: () => {},
};

const streamChunks = (
  chunks: UIMessageChunk[],
): ReadableStream<UIMessageChunk> =>
  new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

const textChunks = (id: string, text: string): UIMessageChunk[] => [
  { type: "start-step" },
  { type: "text-start", id },
  { type: "text-delta", id, delta: text },
  { type: "text-end", id },
];

const SubmitForSecondConversation = ({
  conversationId,
  submitText,
}: Pick<
  PetrinautAiComposerControlContext,
  "conversationId" | "submitText"
>) => {
  useEffect(() => {
    if (conversationId === "conversation-2") {
      void submitText({ id: "second-turn", text: "Second conversation" });
    }
  }, [conversationId, submitText]);

  return null;
};

const testInstances: ReturnType<typeof createPetrinaut>[] = [];

const renderTestPanel = ({
  aiAssistant,
  editorContext = editorContextValue,
  initialInteractionMode,
  initialMessage,
  onInitialInteractionModeConsumed,
  petriNetDefinition = emptySDCPN,
}: {
  aiAssistant: PetrinautAiAssistant;
  editorContext?: EditorContextValue;
  initialInteractionMode?: PetrinautAiInputMode;
  initialMessage?: string;
  onInitialInteractionModeConsumed?: () => void;
  petriNetDefinition?: SDCPN;
}) => {
  const handle = createJsonDocHandle({
    id: "ai-assistant-panel-test",
    initial: petriNetDefinition,
  });
  const instance = createPetrinaut({ document: handle });
  testInstances.push(instance);
  const sdcpnContext: SDCPNContextValue = {
    createNewNet: () => {},
    existingNets: [],
    loadPetriNet: () => {},
    petriNetId: "ai-assistant-panel-test",
    petriNetDefinition,
    readonly: false,
    extensions: DEFAULT_PETRINAUT_EXTENSIONS,
    setTitle: () => {},
    title: "AI assistant panel test",
    getItemType: () => null,
  };

  const renderPanel = (
    nextAiAssistant: PetrinautAiAssistant,
    nextEditorContext: EditorContextValue,
    nextInitialInteractionMode = initialInteractionMode,
    nextInitialMessage = initialMessage,
  ) => (
    <PetrinautInstanceContext.Provider value={instance}>
      <NotificationsProvider>
        <EditorContext.Provider value={nextEditorContext}>
          <SDCPNContext.Provider value={sdcpnContext}>
            <AiAssistantPanel
              aiAssistant={nextAiAssistant}
              initialInteractionMode={nextInitialInteractionMode}
              initialMessage={nextInitialMessage}
              onInitialInteractionModeConsumed={
                onInitialInteractionModeConsumed
              }
            />
          </SDCPNContext.Provider>
        </EditorContext.Provider>
      </NotificationsProvider>
    </PetrinautInstanceContext.Provider>
  );
  const rendered = render(renderPanel(aiAssistant, editorContext));

  return {
    ...rendered,
    rerenderPanel: (
      nextAiAssistant: PetrinautAiAssistant,
      nextEditorContext = editorContext,
    ) => rendered.rerender(renderPanel(nextAiAssistant, nextEditorContext)),
    rerenderPanelWithInitialRequest: (
      nextInitialInteractionMode: PetrinautAiInputMode,
      nextInitialMessage: string,
    ) =>
      rendered.rerender(
        renderPanel(
          aiAssistant,
          editorContext,
          nextInitialInteractionMode,
          nextInitialMessage,
        ),
      ),
  };
};

afterEach(() => {
  cleanup();
  for (const instance of testInstances.splice(0)) {
    instance.dispose();
  }
});

describe("AiAssistantPanel composer submissions", () => {
  test("invalidates registered Voice controls before typed submit while active publication is pending", async () => {
    const events: string[] = [];
    let finishVoiceEnd: (() => void) | undefined;
    const endVoice = vi.fn(() => {
      events.push("end");
      return new Promise<void>((resolve) => {
        finishVoiceEnd = resolve;
      });
    });
    const sendMessages = vi.fn(() => {
      events.push("submit");
      return Promise.resolve(
        streamChunks(
          textChunks("pending-active-handoff", "Pending handoff accepted"),
        ),
      );
    });
    const VoiceMode = ({
      context,
    }: {
      context: PetrinautAiVoiceModeContext;
    }) => {
      const { registerVoiceModeControls } = context;

      useEffect(
        () =>
          registerVoiceModeControls({
            end: endVoice,
            pause: vi.fn(),
            reconnect: vi.fn(),
            resume: vi.fn(),
            setMicrophoneMuted: vi.fn(),
          }),
        [registerVoiceModeControls],
      );

      return (
        <button type="button" onClick={() => context.setInputMode("voice")}>
          Select voice before active publication
        </button>
      );
    };

    renderTestPanel({
      aiAssistant: {
        renderVoiceMode: (context) => <VoiceMode context={context} />,
        transport: {
          reconnectToStream: () => Promise.resolve(null),
          sendMessages,
        },
      },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Select voice before active publication",
      }),
    );
    const textarea = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Message AI assistant",
    });
    fireEvent.change(textarea, {
      target: { value: "Typed during activation" },
    });
    const sendButton = screen.getByRole("button", { name: "Send message" });
    fireEvent.click(sendButton);
    fireEvent.click(sendButton);
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(events).toEqual(["end"]);
    expect(sendMessages).not.toHaveBeenCalled();

    await act(async () => finishVoiceEnd?.());
    await screen.findByText("Pending handoff accepted");

    expect(events).toEqual(["end", "submit"]);
    expect(endVoice).toHaveBeenCalledOnce();
    expect(sendMessages).toHaveBeenCalledOnce();
  });

  test("invalidates active Voice mode before submitting initial CTA text", async () => {
    const events: string[] = [];
    let finishVoiceEnd: (() => void) | undefined;
    const endVoice = vi.fn(() => {
      events.push("end");
      return new Promise<void>((resolve) => {
        finishVoiceEnd = resolve;
      });
    });
    const sendMessages = vi.fn(() => {
      events.push("submit");
      return Promise.resolve(
        streamChunks(textChunks("cta-handoff", "CTA handoff accepted")),
      );
    });
    const VoiceMode = ({
      context,
    }: {
      context: PetrinautAiVoiceModeContext;
    }) => {
      const {
        inputMode,
        registerVoiceModeControls,
        setVoiceActive: publishVoiceActive,
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
        [registerVoiceModeControls],
      );
      useEffect(() => {
        if (inputMode === "voice") {
          publishVoiceActive(true);
        }
      }, [inputMode, publishVoiceActive]);

      return <div>{`Voice mode ${inputMode}`}</div>;
    };
    const aiAssistant: PetrinautAiAssistant = {
      renderVoiceMode: (context) => <VoiceMode context={context} />,
      transport: {
        reconnectToStream: () => Promise.resolve(null),
        sendMessages,
      },
    };
    const rendered = renderTestPanel({
      aiAssistant,
      initialInteractionMode: "voice",
    });
    await screen.findByText("Voice mode voice");

    rendered.rerenderPanelWithInitialRequest(
      "text",
      "Create the support workflow",
    );

    expect(events).toEqual(["end"]);
    expect(sendMessages).not.toHaveBeenCalled();

    await act(async () => finishVoiceEnd?.());
    await screen.findByText("CTA handoff accepted");

    expect(events).toEqual(["end", "submit"]);
    expect(endVoice).toHaveBeenCalledOnce();
    expect(sendMessages).toHaveBeenCalledOnce();
  });

  test("invalidates active Voice mode before submitting typed text exactly once", async () => {
    const events: string[] = [];
    let finishVoiceEnd: (() => void) | undefined;
    let latestVoiceContext: PetrinautAiVoiceModeContext | undefined;
    const endVoice = vi.fn(() => {
      events.push("end");
      return new Promise<void>((resolve) => {
        finishVoiceEnd = resolve;
      });
    });
    const sendMessages = vi.fn(() => {
      events.push("submit");
      return Promise.resolve(
        streamChunks(textChunks("typed-handoff", "Typed handoff accepted")),
      );
    });
    const VoiceMode = ({
      context,
    }: {
      context: PetrinautAiVoiceModeContext;
    }) => {
      const { registerVoiceModeControls } = context;

      useEffect(
        () =>
          registerVoiceModeControls({
            end: endVoice,
            pause: vi.fn(),
            reconnect: vi.fn(),
            resume: vi.fn(),
            setMicrophoneMuted: vi.fn(),
          }),
        [registerVoiceModeControls],
      );

      return (
        <button
          type="button"
          onClick={() => {
            context.setVoiceActive(true);
            context.setInputMode("voice");
          }}
        >
          Activate voice session
        </button>
      );
    };

    renderTestPanel({
      aiAssistant: {
        renderVoiceMode: (context) => {
          latestVoiceContext = context;
          return <VoiceMode context={context} />;
        },
        transport: {
          reconnectToStream: () => Promise.resolve(null),
          sendMessages,
        },
      },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Activate voice session" }),
    );
    const textarea = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Message AI assistant",
    });
    fireEvent.change(textarea, { target: { value: "Typed takeover" } });
    const sendButton = screen.getByRole("button", { name: "Send message" });
    fireEvent.click(sendButton);
    fireEvent.click(sendButton);
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(events).toEqual(["end"]);
    expect(sendMessages).not.toHaveBeenCalled();
    expect(textarea.value).toBe("Typed takeover");
    expect(textarea.disabled).toBe(true);
    expect(latestVoiceContext?.inputMode).toBe("text");

    await act(async () => finishVoiceEnd?.());
    await screen.findByText("Typed handoff accepted");

    expect(events).toEqual(["end", "submit"]);
    expect(sendMessages).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(textarea);
  });

  test("preserves typed text when Voice invalidation throws synchronously", async () => {
    let latestVoiceContext: PetrinautAiVoiceModeContext | undefined;
    const endVoice = vi.fn(() => {
      throw new Error("Voice invalidation failed.");
    });
    const sendMessages = vi.fn(() =>
      Promise.resolve(
        streamChunks(textChunks("unexpected-handoff", "Unexpected submit")),
      ),
    );
    const VoiceMode = ({
      context,
    }: {
      context: PetrinautAiVoiceModeContext;
    }) => {
      const { registerVoiceModeControls } = context;

      useEffect(
        () =>
          registerVoiceModeControls({
            end: endVoice,
            pause: vi.fn(),
            reconnect: vi.fn(),
            resume: vi.fn(),
            setMicrophoneMuted: vi.fn(),
          }),
        [registerVoiceModeControls],
      );

      return (
        <button
          type="button"
          onClick={() => {
            context.setVoiceActive(true);
            context.setInputMode("voice");
          }}
        >
          Activate failing voice session
        </button>
      );
    };

    renderTestPanel({
      aiAssistant: {
        renderVoiceMode: (context) => {
          latestVoiceContext = context;
          return <VoiceMode context={context} />;
        },
        transport: {
          reconnectToStream: () => Promise.resolve(null),
          sendMessages,
        },
      },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Activate failing voice session" }),
    );
    const textarea = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Message AI assistant",
    });
    fireEvent.change(textarea, { target: { value: "Keep this draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await act(async () => {});

    expect(endVoice).toHaveBeenCalledOnce();
    expect(sendMessages).not.toHaveBeenCalled();
    expect(textarea.value).toBe("Keep this draft");
    expect(textarea.disabled).toBe(false);
    expect(latestVoiceContext?.inputMode).toBe("voice");
    expect(screen.getByText("Voice invalidation failed.")).not.toBeNull();
  });

  test("restores a typed draft when its post-Voice message submission rejects", async () => {
    let finishVoiceEnd: (() => void) | undefined;
    let rejectSubmission: ((reason: Error) => void) | undefined;
    const endVoice = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishVoiceEnd = resolve;
        }),
    );
    const sendMessages = vi.fn(
      () =>
        new Promise<ReadableStream<UIMessageChunk>>((_resolve, reject) => {
          rejectSubmission = reject;
        }),
    );
    const VoiceMode = ({
      context,
    }: {
      context: PetrinautAiVoiceModeContext;
    }) => {
      useEffect(
        () =>
          context.registerVoiceModeControls({
            end: endVoice,
            pause: vi.fn(),
            reconnect: vi.fn(),
            resume: vi.fn(),
            setMicrophoneMuted: vi.fn(),
          }),
        [context],
      );

      return (
        <button
          type="button"
          onClick={() => {
            context.setVoiceActive(true);
            context.setInputMode("voice");
          }}
        >
          Activate Voice for rejected message
        </button>
      );
    };

    renderTestPanel({
      aiAssistant: {
        renderVoiceMode: (context) => <VoiceMode context={context} />,
        transport: {
          reconnectToStream: () => Promise.resolve(null),
          sendMessages,
        },
      },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Activate Voice for rejected message",
      }),
    );
    const textarea = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Message AI assistant",
    });
    fireEvent.change(textarea, { target: { value: "Recover this draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await act(async () => finishVoiceEnd?.());
    await waitFor(() => expect(sendMessages).toHaveBeenCalledOnce());

    await act(async () => {
      rejectSubmission?.(new Error("Typed handoff rejected."));
    });

    expect(await screen.findByText("Typed handoff rejected.")).not.toBeNull();
    expect(textarea.value).toBe("Recover this draft");
    expect(textarea.disabled).toBe(false);
    expect(endVoice).toHaveBeenCalledOnce();
  });

  test("does not replace newer composer input when a Voice handoff rejects", async () => {
    let finishVoiceEnd: (() => void) | undefined;
    let rejectSubmission: ((reason: Error) => void) | undefined;
    const endVoice = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishVoiceEnd = resolve;
        }),
    );
    const sendMessages = vi.fn(
      () =>
        new Promise<ReadableStream<UIMessageChunk>>((_resolve, reject) => {
          rejectSubmission = reject;
        }),
    );
    const VoiceMode = ({
      context,
    }: {
      context: PetrinautAiVoiceModeContext;
    }) => {
      useEffect(
        () =>
          context.registerVoiceModeControls({
            end: endVoice,
            pause: vi.fn(),
            reconnect: vi.fn(),
            resume: vi.fn(),
            setMicrophoneMuted: vi.fn(),
          }),
        [context],
      );

      return (
        <button type="button" onClick={() => context.setInputMode("voice")}>
          Select Voice for newer draft
        </button>
      );
    };

    renderTestPanel({
      aiAssistant: {
        renderVoiceMode: (context) => <VoiceMode context={context} />,
        transport: {
          reconnectToStream: () => Promise.resolve(null),
          sendMessages,
        },
      },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Select Voice for newer draft" }),
    );
    const textarea = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Message AI assistant",
    });
    fireEvent.change(textarea, { target: { value: "Original draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await act(async () => finishVoiceEnd?.());
    await waitFor(() => expect(sendMessages).toHaveBeenCalledOnce());
    fireEvent.change(textarea, { target: { value: "Unrelated newer input" } });

    await act(async () => {
      rejectSubmission?.(new Error("Late handoff rejection."));
    });

    expect(textarea.value).toBe("Unrelated newer input");
    expect(textarea.disabled).toBe(false);
  });

  test("restores a typed draft when its post-Voice tool submission rejects", async () => {
    let finishVoiceEnd: (() => void) | undefined;
    const endVoice = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishVoiceEnd = resolve;
        }),
    );
    const sendMessages = vi.fn(() =>
      Promise.reject(new Error("Mapped handoff rejected.")),
    );
    const hostTool = definePetrinautAiInteractiveTool({
      toolName: "answerQuestion",
      inputSchema: {
        parse: (raw: unknown) => raw as { question: string },
      },
      outputSchema: {
        parse: (raw: unknown) => raw as { answer: string },
      },
      fromComposerText: ({ text }) => ({ answer: text }),
      component: ({ input }) => <span>{input.question}</span>,
    });
    const VoiceMode = ({
      context,
    }: {
      context: PetrinautAiVoiceModeContext;
    }) => {
      useEffect(
        () =>
          context.registerVoiceModeControls({
            end: endVoice,
            pause: vi.fn(),
            reconnect: vi.fn(),
            resume: vi.fn(),
            setMicrophoneMuted: vi.fn(),
          }),
        [context],
      );

      return (
        <button type="button" onClick={() => context.setInputMode("voice")}>
          Select Voice for mapped handoff
        </button>
      );
    };

    renderTestPanel({
      aiAssistant: {
        interactiveTools: [hostTool],
        messages: [
          {
            id: "assistant-pending-question",
            parts: [
              {
                input: { question: "Which environment?" },
                state: "input-available",
                toolCallId: "pending-question",
                toolName: "answerQuestion",
                type: "dynamic-tool",
              },
            ],
            role: "assistant",
          } as unknown as PetrinautAiMessage,
        ],
        renderVoiceMode: (context) => <VoiceMode context={context} />,
        transport: {
          reconnectToStream: () => Promise.resolve(null),
          sendMessages,
        },
      },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Select Voice for mapped handoff" }),
    );
    const textarea = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Message AI assistant",
    });
    fireEvent.change(textarea, { target: { value: "Production" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await act(async () => finishVoiceEnd?.());

    expect(await screen.findByText("Mapped handoff rejected.")).not.toBeNull();
    expect(textarea.value).toBe("Production");
    expect(textarea.disabled).toBe(false);
    expect(endVoice).toHaveBeenCalledOnce();
  });

  test("orders prompt-chip submission after Voice invalidation exactly once", async () => {
    const events: string[] = [];
    let finishVoiceEnd: (() => void) | undefined;
    const endVoice = vi.fn(() => {
      events.push("end");
      return new Promise<void>((resolve) => {
        finishVoiceEnd = resolve;
      });
    });
    const sendMessages = vi.fn(() => {
      events.push("submit");
      return Promise.resolve(
        streamChunks(textChunks("prompt-response", "Prompt accepted")),
      );
    });
    const VoiceMode = ({
      context,
    }: {
      context: PetrinautAiVoiceModeContext;
    }) => {
      useEffect(
        () =>
          context.registerVoiceModeControls({
            end: endVoice,
            pause: vi.fn(),
            reconnect: vi.fn(),
            resume: vi.fn(),
            setMicrophoneMuted: vi.fn(),
          }),
        [context],
      );

      return (
        <button type="button" onClick={() => context.setInputMode("voice")}>
          Select Voice before prompt
        </button>
      );
    };

    renderTestPanel({
      aiAssistant: {
        renderVoiceMode: (context) => <VoiceMode context={context} />,
        transport: {
          reconnectToStream: () => Promise.resolve(null),
          sendMessages,
        },
      },
      petriNetDefinition: {
        ...emptySDCPN,
        places: [
          {
            colorId: null,
            differentialEquationId: null,
            dynamicsEnabled: false,
            id: "place__review",
            name: "Review",
            x: 0,
            y: 0,
          },
        ],
      },
    });

    const promptChip = screen.getByRole("button", {
      name: /Suggest improvements/u,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Select Voice before prompt" }),
    );
    fireEvent.click(promptChip);
    fireEvent.click(promptChip);

    expect(events).toEqual(["end"]);
    expect(sendMessages).not.toHaveBeenCalled();

    await act(async () => finishVoiceEnd?.());
    await screen.findByText("Prompt accepted");

    expect(events).toEqual(["end", "submit"]);
    expect(endVoice).toHaveBeenCalledOnce();
    expect(sendMessages).toHaveBeenCalledOnce();
  });

  test("pauses active Voice mode before closing and does not resume on reopen", () => {
    const events: string[] = [];
    const pauseVoice = vi.fn(() => events.push("pause"));
    const VoiceMode = ({
      context,
    }: {
      context: PetrinautAiVoiceModeContext;
    }) => {
      const { registerVoiceModeControls } = context;

      useEffect(
        () =>
          registerVoiceModeControls({
            end: async () => undefined,
            pause: pauseVoice,
            reconnect: vi.fn(),
            resume: vi.fn(),
            setMicrophoneMuted: vi.fn(),
          }),
        [registerVoiceModeControls],
      );

      return (
        <button type="button" onClick={() => context.setVoiceActive(true)}>
          Activate voice session
        </button>
      );
    };
    const setAiAssistantOpen = vi.fn(() => events.push("close"));
    const openEditorContext = {
      ...editorContextValue,
      setAiAssistantOpen,
    };
    const aiAssistant: PetrinautAiAssistant = {
      renderVoiceMode: (context) => <VoiceMode context={context} />,
      transport: {
        reconnectToStream: () => Promise.resolve(null),
        sendMessages: vi.fn(),
      },
    };
    const rendered = renderTestPanel({
      aiAssistant,
      editorContext: openEditorContext,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Activate voice session" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close AI assistant" }));

    expect(events).toEqual(["pause", "close"]);
    expect(pauseVoice).toHaveBeenCalledOnce();

    rendered.rerenderPanel(aiAssistant, {
      ...openEditorContext,
      isAiAssistantOpen: false,
    });
    rendered.rerenderPanel(aiAssistant, openEditorContext);

    expect(pauseVoice).toHaveBeenCalledOnce();
  });

  test("pauses registered Voice controls before close while active publication is pending", () => {
    const events: string[] = [];
    const pauseVoice = vi.fn(() => events.push("pause"));
    const VoiceMode = ({
      context,
    }: {
      context: PetrinautAiVoiceModeContext;
    }) => {
      const { registerVoiceModeControls } = context;

      useEffect(
        () =>
          registerVoiceModeControls({
            end: async () => undefined,
            pause: pauseVoice,
            reconnect: vi.fn(),
            resume: vi.fn(),
            setMicrophoneMuted: vi.fn(),
          }),
        [registerVoiceModeControls],
      );

      return (
        <button type="button" onClick={() => context.setInputMode("voice")}>
          Select pending voice session
        </button>
      );
    };
    const setAiAssistantOpen = vi.fn(() => events.push("close"));

    renderTestPanel({
      aiAssistant: {
        renderVoiceMode: (context) => <VoiceMode context={context} />,
        transport: {
          reconnectToStream: () => Promise.resolve(null),
          sendMessages: vi.fn(),
        },
      },
      editorContext: {
        ...editorContextValue,
        setAiAssistantOpen,
      },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Select pending voice session" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close AI assistant" }));

    expect(events).toEqual(["pause", "close"]);
    expect(pauseVoice).toHaveBeenCalledOnce();
  });

  test("exposes provider-neutral voice mode state and stable controls", () => {
    const inputModes: PetrinautAiInputMode[] = [];
    const setInputModeReferences = new Set<unknown>();
    const setVoiceActiveReferences = new Set<unknown>();
    const submitVoiceInputReferences = new Set<unknown>();
    const aiAssistant: PetrinautAiAssistant = {
      renderVoiceMode: (context) => {
        inputModes.push(context.inputMode);
        setInputModeReferences.add(context.setInputMode);
        setVoiceActiveReferences.add(context.setVoiceActive);
        submitVoiceInputReferences.add(context.submitVoiceInput);

        return (
          <button type="button" onClick={() => context.setInputMode("voice")}>
            {context.isAiAssistantOpen
              ? "Open voice mode"
              : "Closed voice mode"}
          </button>
        );
      },
      transport: {
        reconnectToStream: () => Promise.resolve(null),
        sendMessages: vi.fn(),
      },
    };
    const rendered = renderTestPanel({ aiAssistant });

    fireEvent.click(screen.getByRole("button", { name: "Open voice mode" }));
    expect(inputModes.at(-1)).toBe("voice");

    rendered.rerenderPanel(aiAssistant, {
      ...editorContextValue,
      isAiAssistantOpen: false,
    });

    expect(screen.getByText("Closed voice mode")).not.toBeNull();
    expect(setInputModeReferences.size).toBe(1);
    expect(setVoiceActiveReferences.size).toBe(1);
    expect(submitVoiceInputReferences.size).toBe(1);
  });

  test("keeps one mounted voice mode when the panel closes and reopens", () => {
    voiceModeMounts = 0;
    voiceModeUnmounts = 0;
    const VoiceMode = ({ isOpen }: { isOpen: boolean }) => {
      useEffect(() => {
        voiceModeMounts += 1;
        return () => {
          voiceModeUnmounts += 1;
        };
      }, []);
      return <div>{`Voice mode ${isOpen ? "open" : "closed"}`}</div>;
    };
    const aiAssistant: PetrinautAiAssistant = {
      renderVoiceMode: ({ isAiAssistantOpen }) => (
        <VoiceMode isOpen={isAiAssistantOpen} />
      ),
      transport: {
        reconnectToStream: () => Promise.resolve(null),
        sendMessages: vi.fn(),
      },
    };
    const rendered = renderTestPanel({ aiAssistant });

    expect(screen.getByText("Voice mode open")).not.toBeNull();
    rendered.rerenderPanel(aiAssistant, {
      ...editorContextValue,
      isAiAssistantOpen: false,
    });
    expect(screen.getByText("Voice mode closed")).not.toBeNull();
    rendered.rerenderPanel(aiAssistant, editorContextValue);

    expect(screen.getByText("Voice mode open")).not.toBeNull();
    expect(voiceModeMounts).toBe(1);
    expect(voiceModeUnmounts).toBe(0);
  });

  test("ends active Voice mode when the unified composer returns to text", () => {
    voiceModeMounts = 0;
    voiceModeUnmounts = 0;
    const endVoice = vi.fn(async () => undefined);
    const VoiceMode = (context: PetrinautAiVoiceModeContext) => {
      const { inputMode, registerVoiceModeControls, setVoiceActive } = context;
      useEffect(() => {
        voiceModeMounts += 1;
        return () => {
          voiceModeUnmounts += 1;
        };
      }, []);
      useEffect(
        () =>
          registerVoiceModeControls({
            end: endVoice,
            pause: vi.fn(),
            reconnect: vi.fn(),
            resume: vi.fn(),
            setMicrophoneMuted: vi.fn(),
          }),
        [registerVoiceModeControls],
      );
      useEffect(() => {
        if (inputMode === "voice") {
          setVoiceActive(true);
        }
      }, [inputMode, setVoiceActive]);
      return (
        <button type="button" onClick={() => context.setInputMode("text")}>
          {`Voice mode ${inputMode}`}
        </button>
      );
    };
    const sendMessages = vi.fn();
    const aiAssistant: PetrinautAiAssistant = {
      renderVoiceMode: (context) => <VoiceMode {...context} />,
      transport: {
        reconnectToStream: () => Promise.resolve(null),
        sendMessages,
      },
    };

    renderTestPanel({ aiAssistant });

    fireEvent.click(screen.getByRole("button", { name: "Start voice mode" }));
    expect(screen.getByText("Voice mode voice")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Voice mode voice" }));

    expect(
      screen.getByPlaceholderText("Describe the process you want to create"),
    ).not.toBeNull();
    expect(endVoice).toHaveBeenCalledOnce();
    expect(voiceModeMounts).toBe(1);
    expect(voiceModeUnmounts).toBe(0);
    expect(sendMessages).not.toHaveBeenCalled();
  });

  test("defers and consumes an initial Voice mode once, then falls back to text", () => {
    let latestInputMode = "text";
    const onInitialInteractionModeConsumed = vi.fn();
    const aiAssistant: PetrinautAiAssistant = {
      renderVoiceMode: (context) => {
        latestInputMode = context.inputMode;
        return <div>Voice mode</div>;
      },
      transport: {
        reconnectToStream: () => Promise.resolve(null),
        sendMessages: vi.fn(),
      },
    };
    const closedEditorContext = {
      ...editorContextValue,
      isAiAssistantOpen: false,
    };
    const rendered = renderTestPanel({
      aiAssistant,
      editorContext: closedEditorContext,
      initialInteractionMode: "voice",
      onInitialInteractionModeConsumed,
    });

    expect(latestInputMode).toBe("text");
    expect(onInitialInteractionModeConsumed).not.toHaveBeenCalled();

    rendered.rerenderPanel(aiAssistant, editorContextValue);

    expect(latestInputMode).toBe("voice");
    expect(onInitialInteractionModeConsumed).toHaveBeenCalledOnce();

    const unavailableAssistant: PetrinautAiAssistant = {
      transport: aiAssistant.transport,
    };
    rendered.rerenderPanel(unavailableAssistant, editorContextValue);

    expect(screen.queryByText("Voice mode")).toBeNull();
    expect(
      screen.getByPlaceholderText("Describe the process you want to create"),
    ).not.toBeNull();
    expect(onInitialInteractionModeConsumed).toHaveBeenCalledOnce();
  });

  test("accepts one voice input while generic chat is streaming and submits it after settlement", async () => {
    let firstStreamController:
      | ReadableStreamDefaultController<UIMessageChunk>
      | undefined;
    let secondStreamController:
      | ReadableStreamDefaultController<UIMessageChunk>
      | undefined;
    const requests: PetrinautAiMessage[][] = [];
    const transport: PetrinautAiTransport = {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: vi.fn(({ messages }) => {
        requests.push(structuredClone(messages));
        if (requests.length === 1) {
          return Promise.resolve(
            new ReadableStream({
              start(controller) {
                firstStreamController = controller;
                controller.enqueue({ type: "start-step" });
                controller.enqueue({
                  type: "tool-input-available",
                  dynamic: true,
                  toolCallId: "queued-question",
                  toolName: "answerQuestion",
                  input: { question: "Who approves it?" },
                });
              },
            }),
          );
        }
        if (requests.length === 2) {
          return Promise.resolve(
            new ReadableStream({
              start(controller) {
                secondStreamController = controller;
                for (const chunk of textChunks(
                  "acknowledgement",
                  "Answer accepted",
                )) {
                  controller.enqueue(chunk);
                }
              },
            }),
          );
        }
        return Promise.resolve(
          streamChunks(textChunks("next-answer", "Next answer accepted")),
        );
      }),
    };
    const hostTool = definePetrinautAiInteractiveTool({
      toolName: "answerQuestion",
      inputSchema: {
        parse: (raw: unknown) => raw as { question: string },
      },
      outputSchema: {
        parse: (raw: unknown) => raw as { answer: string },
      },
      fromComposerText: ({ text }) => ({ answer: text }),
      component: ({ input }) => <span>{input.question}</span>,
    });
    let latestVoiceContext: PetrinautAiVoiceModeContext | undefined;

    renderTestPanel({
      aiAssistant: {
        interactiveTools: [hostTool],
        renderVoiceMode: (context) => {
          latestVoiceContext = context;
          return (
            <button
              type="button"
              onClick={() => {
                void (context.status === "ready"
                  ? context.submitText({ text: "Begin" })
                  : context.submitVoiceInput({
                      text: "Queued voice input",
                    }));
              }}
            >
              {context.status === "ready" ? "Begin" : "Answer now"}
            </button>
          );
        },
        transport,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Begin" }));
    await screen.findByRole("button", { name: "Answer now" });
    expect(latestVoiceContext?.canAcceptVoiceInput).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Answer now" }));
    await waitFor(() =>
      expect(latestVoiceContext?.canAcceptVoiceInput).toBe(false),
    );
    expect(requests).toHaveLength(1);

    await act(async () => firstStreamController?.close());
    await screen.findByText("Answer accepted");

    expect(requests).toHaveLength(2);
    expect(latestVoiceContext?.status).toBe("streaming");
    expect(latestVoiceContext?.canAcceptVoiceInput).toBe(true);
    expect(requests[1]?.at(-1)).toMatchObject({
      metadata: { source: "voice", toolCallId: "queued-question" },
      role: "assistant",
    });
    expect(
      requests[1]?.some(
        (message) =>
          message.role === "user" &&
          message.parts.some(
            (part) =>
              part.type === "text" && part.text === "Queued voice input",
          ),
      ),
    ).toBe(false);

    void latestVoiceContext?.submitVoiceInput({
      text: "Next voice input",
    });
    await waitFor(() =>
      expect(latestVoiceContext?.canAcceptVoiceInput).toBe(false),
    );
    expect(requests).toHaveLength(2);

    await act(async () => secondStreamController?.close());
    await screen.findByText("Next answer accepted");
    expect(requests).toHaveLength(3);
    expect(requests[2]?.at(-1)).toMatchObject({
      metadata: { source: "voice" },
      role: "user",
      parts: [{ type: "text", text: "Next voice input" }],
    });
  });

  test("reopens the voice input buffer when the conversation changes", async () => {
    let streamController:
      | ReadableStreamDefaultController<UIMessageChunk>
      | undefined;
    const transport: PetrinautAiTransport = {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: vi.fn(() =>
        Promise.resolve(
          new ReadableStream({
            start(controller) {
              streamController = controller;
              for (const chunk of textChunks("question", "Question ready")) {
                controller.enqueue(chunk);
              }
            },
          }),
        ),
      ),
    };
    let latestVoiceContext: PetrinautAiVoiceModeContext | undefined;
    const createAiAssistant = (
      conversationId: string,
    ): PetrinautAiAssistant => ({
      conversationId,
      renderVoiceMode: (context) => {
        latestVoiceContext = context;
        return null;
      },
      transport,
    });
    const rendered = renderTestPanel({
      aiAssistant: createAiAssistant("conversation-1"),
    });
    let initialSubmission: Promise<unknown> | undefined;
    act(() => {
      initialSubmission = latestVoiceContext?.submitText({ text: "Begin" });
    });
    void initialSubmission?.catch(() => undefined);
    await waitFor(() => expect(latestVoiceContext?.status).toBe("streaming"));
    let queuedAnswer: Promise<unknown> | undefined;
    act(() => {
      queuedAnswer = latestVoiceContext?.submitVoiceInput({
        target: "message",
        text: "Queued voice input",
      });
    });
    const queuedAnswerRejection = expect(queuedAnswer).rejects.toThrow(
      "The voice conversation changed.",
    );
    await waitFor(() =>
      expect(latestVoiceContext?.canAcceptVoiceInput).toBe(false),
    );

    rendered.rerenderPanel(createAiAssistant("conversation-2"));

    await queuedAnswerRejection;
    await waitFor(() =>
      expect(latestVoiceContext?.canAcceptVoiceInput).toBe(true),
    );
    await act(async () => streamController?.close());
  });

  test("exposes the generated useChat conversation identity to host controls", async () => {
    const chatIds: string[] = [];
    const observedConversationIds = new Set<string>();
    const transport: PetrinautAiTransport = {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: vi.fn(({ chatId }) => {
        chatIds.push(chatId);
        return Promise.resolve(
          streamChunks(
            textChunks("generated-id-response", "Generated ID used"),
          ),
        );
      }),
    };

    renderTestPanel({
      aiAssistant: {
        renderComposerControl: (context) => {
          observedConversationIds.add(context.conversationId);
          return (
            <button
              type="button"
              onClick={() => {
                void context.submitText({ text: "Use generated identity" });
              }}
            >
              Submit with generated identity
            </button>
          );
        },
        transport,
      },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Submit with generated identity" }),
    );
    await screen.findByText("Generated ID used");

    expect(chatIds).toHaveLength(1);
    expect(chatIds[0]).toBeTruthy();
    expect(observedConversationIds).toEqual(new Set(chatIds));
  });

  test("submits to the current chat when the conversation identity changes", async () => {
    const chatIds: string[] = [];
    const transport: PetrinautAiTransport = {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: vi.fn(({ chatId }) => {
        chatIds.push(chatId);
        return Promise.resolve(
          streamChunks(textChunks("second-response", "Second chat used")),
        );
      }),
    };
    const createAiAssistant = (
      conversationId: string,
    ): PetrinautAiAssistant => ({
      conversationId,
      renderComposerControl: (context) => (
        <SubmitForSecondConversation {...context} />
      ),
      transport,
    });
    const rendered = renderTestPanel({
      aiAssistant: createAiAssistant("conversation-1"),
    });

    rendered.rerenderPanel(createAiAssistant("conversation-2"));
    await waitFor(() => expect(chatIds).toHaveLength(1));

    expect(chatIds).toEqual(["conversation-2"]);
  });

  test("shares one stable submission path between alternate and keyboard text", async () => {
    const requestMessages: PetrinautAiMessage[][] = [];
    const chatIds: string[] = [];
    const transport: PetrinautAiTransport = {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: vi.fn(({ chatId, messages }) => {
        chatIds.push(chatId);
        requestMessages.push(structuredClone(messages));
        const responseId = `response-${requestMessages.length}`;
        return Promise.resolve(
          streamChunks([
            { type: "start-step" },
            { type: "text-start", id: responseId },
            {
              type: "text-delta",
              id: responseId,
              delta: `Response ${requestMessages.length}`,
            },
            { type: "text-end", id: responseId },
          ]),
        );
      }),
    };
    const submitTextReferences = new Set<unknown>();
    const stopReferences = new Set<unknown>();
    const observedConversationIds = new Set<string | undefined>();
    const aiAssistant: PetrinautAiAssistant = {
      conversationId: "voice-conversation-1",
      renderComposerControl: (context) => {
        submitTextReferences.add(context.submitText);
        stopReferences.add(context.stop);
        observedConversationIds.add(context.conversationId);

        return (
          <button
            type="button"
            onClick={() => {
              void context.submitText({
                id: "voice-turn-1",
                text: "  Alternate turn  ",
              });
            }}
          >
            Submit alternate text
          </button>
        );
      },
      transport,
    };

    renderTestPanel({ aiAssistant });

    fireEvent.click(
      screen.getByRole("button", { name: "Submit alternate text" }),
    );
    await screen.findByText("Response 1");

    const textarea = screen.getByRole("textbox", {
      name: "Message AI assistant",
    });
    fireEvent.change(textarea, { target: { value: "Keyboard turn" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    await screen.findByText("Response 2");

    expect(chatIds).toEqual(["voice-conversation-1", "voice-conversation-1"]);
    expect(requestMessages[0]?.[0]).toMatchObject({
      id: "voice-turn-1",
      parts: [{ text: "Alternate turn", type: "text" }],
      role: "user",
    });
    expect(requestMessages[1]?.at(-1)).toMatchObject({
      parts: [{ text: "Keyboard turn", type: "text" }],
      role: "user",
    });
    expect(requestMessages[1]?.at(-1)?.id).not.toBe("voice-turn-1");
    expect(submitTextReferences.size).toBe(1);
    expect(stopReferences.size).toBe(1);
    expect(observedConversationIds).toEqual(new Set(["voice-conversation-1"]));
  });

  test("stops the current response through the host composer control", async () => {
    const aborted = vi.fn();
    const transport: PetrinautAiTransport = {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: vi.fn(
        ({
          abortSignal,
        }: Parameters<PetrinautAiTransport["sendMessages"]>[0]) =>
          Promise.resolve(
            new ReadableStream<UIMessageChunk>({
              start(controller) {
                controller.enqueue({ type: "start-step" });
                controller.enqueue({ type: "text-start", id: "partial" });
                controller.enqueue({
                  type: "text-delta",
                  id: "partial",
                  delta: "Partial response",
                });
                abortSignal?.addEventListener("abort", () => {
                  aborted();
                  controller.error(new DOMException("Aborted", "AbortError"));
                });
              },
            }),
          ),
      ),
    };

    renderTestPanel({
      aiAssistant: {
        renderComposerControl: ({ stop }) => (
          <button
            type="button"
            onClick={() => {
              void stop();
            }}
          >
            Stop from host control
          </button>
        ),
        transport,
      },
      initialMessage: "Start a long response",
    });
    await screen.findByText("Partial response");

    fireEvent.click(
      screen.getByRole("button", { name: "Stop from host control" }),
    );

    await waitFor(() => expect(aborted).toHaveBeenCalledOnce());
    expect(await screen.findByText("Response stopped")).not.toBeNull();
  });

  test("does not carry an idle host stop into a later incidental abort", async () => {
    let requestCount = 0;
    const transport: PetrinautAiTransport = {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: vi.fn(() => {
        requestCount += 1;
        if (requestCount === 1) {
          return Promise.resolve(
            streamChunks([
              { type: "start-step" },
              {
                type: "tool-input-available",
                dynamic: true,
                toolCallId: "confirmation-1",
                toolName: "confirmAction",
                input: { question: "Continue?" },
              },
            ]),
          );
        }

        return Promise.resolve(
          new ReadableStream<UIMessageChunk>({
            start(controller) {
              controller.enqueue({ type: "start-step" });
              controller.enqueue({
                type: "text-start",
                id: "interrupted-follow-up",
              });
              controller.enqueue({
                type: "text-delta",
                id: "interrupted-follow-up",
                delta: "Partial follow-up",
              });
              setTimeout(() => {
                controller.error(new DOMException("Aborted", "AbortError"));
              }, 0);
            },
          }),
        );
      }),
    };
    const hostTool = definePetrinautAiInteractiveTool({
      toolName: "confirmAction",
      inputSchema: {
        parse: (raw: unknown) => raw as { question: string },
      },
      outputSchema: {
        parse: (raw: unknown) => raw as { confirmed: boolean },
      },
      component: ({ input, submit }) => (
        <button
          type="button"
          onClick={() => {
            submit({ confirmed: true });
          }}
        >
          {input.question}
        </button>
      ),
    });

    renderTestPanel({
      aiAssistant: {
        interactiveTools: [hostTool],
        renderComposerControl: ({ status, stop }) => (
          <>
            <button
              type="button"
              onClick={() => {
                void stop();
              }}
            >
              Stop while idle
            </button>
            <span data-testid="host-status">{status}</span>
          </>
        ),
        transport,
      },
      initialMessage: "Ask for confirmation",
    });

    await screen.findByRole("button", { name: "Continue?" });
    await waitFor(() =>
      expect(screen.getByTestId("host-status").textContent).toBe("ready"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Stop while idle" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue?" }));

    await waitFor(() =>
      expect(transport.sendMessages).toHaveBeenCalledTimes(2),
    );
    await waitFor(() =>
      expect(screen.getByTestId("host-status").textContent).toBe("ready"),
    );
    expect(screen.queryByText("Response stopped")).toBeNull();
  });

  test("maps keyboard text to one unresolved host tool before sending another message", async () => {
    const requestMessages: PetrinautAiMessage[][] = [];
    const transport: PetrinautAiTransport = {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: vi.fn(({ messages }) => {
        requestMessages.push(structuredClone(messages));

        if (requestMessages.length === 1) {
          return Promise.resolve(
            streamChunks([
              { type: "start-step" },
              {
                type: "tool-input-available",
                dynamic: true,
                toolCallId: "question-1",
                toolName: "answerQuestion",
                input: { question: "Which environment?" },
              },
            ]),
          );
        }

        return Promise.resolve(
          streamChunks(
            textChunks(
              `response-${requestMessages.length}`,
              requestMessages.length === 2
                ? "Tool answer accepted"
                : "Ordinary text accepted",
            ),
          ),
        );
      }),
    };
    const hostTool = definePetrinautAiInteractiveTool({
      toolName: "answerQuestion",
      inputSchema: {
        parse: (raw: unknown) => raw as { question: string },
      },
      outputSchema: {
        parse: (raw: unknown) => raw as { answer: string },
      },
      fromComposerText: ({ text }) => ({ answer: text }),
      component: ({ input }) => <span>{input.question}</span>,
    });
    const aiAssistant: PetrinautAiAssistant = {
      interactiveTools: [hostTool],
      transport,
    };

    renderTestPanel({ aiAssistant, initialMessage: "Start questions" });
    await screen.findByText("Which environment?");

    const textarea = screen.getByRole("textbox", {
      name: "Message AI assistant",
    });
    fireEvent.change(textarea, { target: { value: "Production" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    await screen.findByText("Tool answer accepted");

    const followUpParts = requestMessages[1]?.at(-1)?.parts ?? [];
    expect(
      followUpParts.filter(
        (part) =>
          part.type === "dynamic-tool" &&
          part.toolCallId === "question-1" &&
          part.state === "output-available",
      ),
    ).toEqual([
      expect.objectContaining({
        output: { answer: "Production" },
        toolCallId: "question-1",
      }),
    ]);
    expect(
      requestMessages[1]?.some(
        (message) =>
          message.role === "user" &&
          message.parts.some(
            (part) => part.type === "text" && part.text === "Production",
          ),
      ),
    ).toBe(false);
    fireEvent.change(textarea, { target: { value: "Production" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    await screen.findByText("Ordinary text accepted");

    expect(requestMessages[2]?.at(-1)).toMatchObject({
      parts: [{ text: "Production", type: "text" }],
      role: "user",
    });
  });

  test("persists voice provenance without clearing an ordinary message draft", async () => {
    const requestMessages: PetrinautAiMessage[][] = [];
    const onMessages = vi.fn();
    const transport: PetrinautAiTransport = {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: vi.fn(({ messages }) => {
        requestMessages.push(structuredClone(messages));
        return Promise.resolve(
          streamChunks(textChunks("voice-response", "Voice message accepted")),
        );
      }),
    };

    renderTestPanel({
      aiAssistant: {
        onMessages,
        renderComposerControl: ({ submitText }) => (
          <button
            type="button"
            onClick={() => {
              void submitText({
                id: "voice-realtime:3:call-1",
                source: "voice",
                text: "Spoken workflow",
              });
            }}
          >
            Submit voice message
          </button>
        ),
        transport,
      },
    });

    const textarea = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Message AI assistant",
    });
    fireEvent.change(textarea, { target: { value: "Typed follow-up draft" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Submit voice message" }),
    );
    await screen.findByText("Voice message accepted");

    expect(textarea.value).toBe("Typed follow-up draft");
    expect(requestMessages).toHaveLength(1);
    expect(requestMessages[0]?.filter(({ role }) => role === "user")).toEqual([
      expect.objectContaining({
        id: "voice-realtime:3:call-1",
        metadata: { source: "voice" },
        parts: [{ text: "Spoken workflow", type: "text" }],
      }),
    ]);
    expect(onMessages.mock.lastCall?.[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "voice-realtime:3:call-1",
          metadata: { source: "voice" },
        }),
      ]),
    );
  });

  test("marks the exact pending tool as voice-origin without a user message", async () => {
    const requestMessages: PetrinautAiMessage[][] = [];
    const onMessages = vi.fn();
    const transport: PetrinautAiTransport = {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: vi.fn(({ messages }) => {
        requestMessages.push(structuredClone(messages));
        return Promise.resolve(
          streamChunks(
            requestMessages.length === 1
              ? [
                  { type: "start-step" },
                  {
                    type: "tool-input-available",
                    dynamic: true,
                    toolCallId: "question-voice",
                    toolName: "answerQuestion",
                    input: { question: "Who approves it?" },
                  },
                ]
              : textChunks("tool-response", "Voice answer accepted"),
          ),
        );
      }),
    };
    const hostTool = definePetrinautAiInteractiveTool({
      toolName: "answerQuestion",
      inputSchema: {
        parse: (raw: unknown) => raw as { question: string },
      },
      outputSchema: {
        parse: (raw: unknown) => raw as { answer: string },
      },
      fromComposerText: ({ text }) => ({ answer: text }),
      component: ({ input }) => <span>{input.question}</span>,
    });

    renderTestPanel({
      aiAssistant: {
        interactiveTools: [hostTool],
        onMessages,
        renderVoiceMode: ({ submitVoiceInput }) => (
          <button
            type="button"
            onClick={() => {
              void submitVoiceInput({
                id: "voice-realtime:3:call-2",
                text: "The shift lead",
              });
            }}
          >
            Submit voice answer
          </button>
        ),
        transport,
      },
      initialMessage: "Start questions",
    });
    await screen.findByText("Who approves it?");

    const textarea = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Message AI assistant",
    });
    fireEvent.change(textarea, { target: { value: "Typed correction draft" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Submit voice answer" }),
    );
    await screen.findByText("Voice answer accepted");

    expect(textarea.value).toBe("Typed correction draft");
    expect(requestMessages).toHaveLength(2);
    const containingMessage = requestMessages[1]?.find((message) =>
      message.parts.some(
        (part) =>
          part.type === "dynamic-tool" && part.toolCallId === "question-voice",
      ),
    );
    expect(containingMessage).toMatchObject({
      metadata: { source: "voice", toolCallId: "question-voice" },
    });
    expect(
      containingMessage?.parts.find(
        (part) =>
          part.type === "dynamic-tool" && part.toolCallId === "question-voice",
      ),
    ).toMatchObject({
      output: { answer: "The shift lead" },
      state: "output-available",
      toolCallId: "question-voice",
    });
    expect(
      requestMessages[1]?.some(
        (message) =>
          message.role === "user" &&
          message.parts.some(
            (part) => part.type === "text" && part.text === "The shift lead",
          ),
      ),
    ).toBe(false);
    expect(onMessages.mock.lastCall?.[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: { source: "voice", toolCallId: "question-voice" },
        }),
      ]),
    );
  });

  test("rolls back failed tool provenance before a typed retry", async () => {
    let latestMessages = [
      {
        id: "assistant-pending-voice-question",
        parts: [
          {
            input: { question: "Who approves it?" },
            state: "input-available",
            toolCallId: "voice-question",
            toolName: "answerQuestion",
            type: "dynamic-tool",
          },
        ],
        role: "assistant",
      },
    ] as unknown as PetrinautAiMessage[];
    const updateMessages = (
      updater: (messages: PetrinautAiMessage[]) => PetrinautAiMessage[],
    ) => {
      latestMessages = updater(latestMessages);
    };
    const addToolOutput = vi
      .fn()
      .mockImplementationOnce(async () => {
        latestMessages = latestMessages.map((message) => ({
          ...message,
          parts: [
            ...message.parts,
            { text: "Unrelated concurrent update", type: "text" },
          ],
        })) as PetrinautAiMessage[];
        throw new Error("Voice tool output rejected.");
      })
      .mockResolvedValueOnce(undefined);
    const params = {
      output: { answer: "The shift lead" },
      tool: "answerQuestion",
      toolCallId: "voice-question",
    };

    await expect(
      addMappedToolOutput({
        addToolOutput,
        currentMessages: latestMessages,
        params,
        source: "voice",
        updateMessages,
      }),
    ).rejects.toThrow("Voice tool output rejected.");

    expect(latestMessages[0]?.metadata).toBeUndefined();
    expect(latestMessages[0]?.parts).toContainEqual({
      text: "Unrelated concurrent update",
      type: "text",
    });

    await addMappedToolOutput({
      addToolOutput,
      currentMessages: latestMessages,
      params: {
        ...params,
        output: { answer: "Typed retry" },
      },
      updateMessages,
    });

    expect(addToolOutput).toHaveBeenLastCalledWith({
      output: { answer: "Typed retry" },
      tool: "answerQuestion",
      toolCallId: "voice-question",
    });
    expect(latestMessages[0]?.metadata).toBeUndefined();
  });

  test("sends review chips as messages while an interactive tool is pending", async () => {
    const requestMessages: PetrinautAiMessage[][] = [];
    const transport: PetrinautAiTransport = {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: vi.fn(({ messages }) => {
        requestMessages.push(structuredClone(messages));
        return Promise.resolve(
          streamChunks(
            requestMessages.length === 1
              ? [
                  { type: "start-step" },
                  {
                    type: "tool-input-available",
                    dynamic: true,
                    toolCallId: "question-1",
                    toolName: "answerQuestion",
                    input: { question: "Which environment?" },
                  },
                ]
              : textChunks("review-response", "Review prompt accepted"),
          ),
        );
      }),
    };
    const hostTool = definePetrinautAiInteractiveTool({
      toolName: "answerQuestion",
      inputSchema: {
        parse: (raw: unknown) => raw as { question: string },
      },
      outputSchema: {
        parse: (raw: unknown) => raw as { answer: string },
      },
      fromComposerText: ({ text }) => ({ answer: text }),
      component: ({ input }) => <span>{input.question}</span>,
    });

    renderTestPanel({
      aiAssistant: {
        interactiveTools: [hostTool],
        transport,
      },
      initialMessage: "Start questions",
      petriNetDefinition: nonEmptySDCPN,
    });
    await screen.findByText("Which environment?");

    fireEvent.click(
      screen.getByRole("button", { name: /Suggest improvements/ }),
    );
    await screen.findByText("Review prompt accepted");

    const reviewMessage = requestMessages[1]?.at(-1);
    const reviewTextPart = reviewMessage?.parts.find(
      (part) => part.type === "text",
    );
    expect(reviewMessage?.role).toBe("user");
    expect(reviewTextPart?.text).toContain("suggest a few improvements");
    expect(
      requestMessages[1]?.some((message) =>
        message.parts.some(
          (part) =>
            part.type === "dynamic-tool" &&
            part.toolCallId === "question-1" &&
            part.state === "input-available",
        ),
      ),
    ).toBe(true);
  });

  test("can force a separate message while an interactive tool is pending", async () => {
    const requestMessages: PetrinautAiMessage[][] = [];
    const transport: PetrinautAiTransport = {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: vi.fn(({ messages }) => {
        requestMessages.push(structuredClone(messages));
        return Promise.resolve(
          streamChunks(
            requestMessages.length === 1
              ? [
                  { type: "start-step" },
                  {
                    type: "tool-input-available",
                    dynamic: true,
                    toolCallId: "question-1",
                    toolName: "answerQuestion",
                    input: { question: "Which environment?" },
                  },
                ]
              : textChunks("correction-response", "Correction accepted"),
          ),
        );
      }),
    };
    const results: unknown[] = [];
    const hostTool = definePetrinautAiInteractiveTool({
      toolName: "answerQuestion",
      inputSchema: {
        parse: (raw: unknown) => raw as { question: string },
      },
      outputSchema: {
        parse: (raw: unknown) => raw as { answer: string },
      },
      fromComposerText: ({ text }) => ({ answer: text }),
      component: ({ input }) => <span>{input.question}</span>,
    });

    renderTestPanel({
      aiAssistant: {
        interactiveTools: [hostTool],
        renderComposerControl: ({ submitText }) => (
          <button
            type="button"
            onClick={() => {
              void submitText({
                id: "correction-1",
                target: "message",
                text: "Correction: staging, not production.",
              }).then((result) => results.push(result));
            }}
          >
            Submit correction
          </button>
        ),
        transport,
      },
      initialMessage: "Start questions",
    });
    await screen.findByText("Which environment?");

    fireEvent.click(screen.getByRole("button", { name: "Submit correction" }));
    await screen.findByText("Correction accepted");

    expect(requestMessages[1]?.at(-1)).toMatchObject({
      id: "correction-1",
      parts: [{ text: "Correction: staging, not production.", type: "text" }],
      role: "user",
    });
    expect(
      requestMessages[1]?.some((message) =>
        message.parts.some(
          (part) =>
            part.type === "dynamic-tool" &&
            part.toolCallId === "question-1" &&
            part.state === "output-available",
        ),
      ),
    ).toBe(false);
    expect(results).toEqual([{ kind: "message", messageId: "correction-1" }]);
  });

  test("falls back to a normal message when a pending tool has no text mapper", async () => {
    const requestMessages: PetrinautAiMessage[][] = [];
    const transport: PetrinautAiTransport = {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: vi.fn(({ messages }) => {
        requestMessages.push(structuredClone(messages));
        return Promise.resolve(
          streamChunks(
            requestMessages.length === 1
              ? [
                  { type: "start-step" },
                  {
                    type: "tool-input-available",
                    dynamic: true,
                    toolCallId: "confirmation-1",
                    toolName: "confirmRelease",
                    input: { question: "Ship this change?" },
                  },
                ]
              : textChunks("ordinary-response", "Ordinary message received"),
          ),
        );
      }),
    };
    const hostTool = definePetrinautAiInteractiveTool({
      toolName: "confirmRelease",
      inputSchema: {
        parse: (raw: unknown) => raw as { question: string },
      },
      outputSchema: {
        parse: (raw: unknown) => raw as { approved: boolean },
      },
      component: ({ input }) => <span>{input.question}</span>,
    });

    renderTestPanel({
      aiAssistant: {
        interactiveTools: [hostTool],
        renderComposerControl: ({ submitText }) => (
          <button
            type="button"
            onClick={() => {
              void submitText({ id: "ordinary-1", text: "Not an answer" });
            }}
          >
            Submit unmapped text
          </button>
        ),
        transport,
      },
      initialMessage: "Start confirmation",
    });
    await screen.findByText("Ship this change?");

    fireEvent.click(
      screen.getByRole("button", { name: "Submit unmapped text" }),
    );
    await screen.findByText("Ordinary message received");

    expect(requestMessages[1]?.at(-1)).toMatchObject({
      id: "ordinary-1",
      parts: [{ text: "Not an answer", type: "text" }],
      role: "user",
    });
  });

  test("falls back to a normal message for an unknown pending tool", async () => {
    const requestMessages: PetrinautAiMessage[][] = [];
    const transport: PetrinautAiTransport = {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: vi.fn(({ messages }) => {
        requestMessages.push(structuredClone(messages));
        return Promise.resolve(
          streamChunks(textChunks("ordinary-response", "Message received")),
        );
      }),
    };

    renderTestPanel({
      aiAssistant: {
        messages: [
          {
            id: "assistant-with-unknown-tool",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                state: "input-available",
                toolCallId: "unknown-1",
                toolName: "unknownTool",
                input: {},
              },
            ],
          },
        ],
        renderComposerControl: ({ submitText }) => (
          <button
            type="button"
            onClick={() => {
              void submitText({ id: "ordinary-2", text: "Ordinary text" });
            }}
          >
            Submit unknown-tool text
          </button>
        ),
        transport,
      },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Submit unknown-tool text" }),
    );
    await screen.findByText("Message received");

    expect(requestMessages[0]?.at(-1)).toMatchObject({
      id: "ordinary-2",
      parts: [{ text: "Ordinary text", type: "text" }],
      role: "user",
    });
  });

  test("rejects ambiguous pending text mappings without submitting", async () => {
    const transport: PetrinautAiTransport = {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: vi.fn(() =>
        Promise.resolve(
          streamChunks([
            { type: "start-step" },
            {
              type: "tool-input-available",
              dynamic: true,
              toolCallId: "question-1",
              toolName: "answerQuestion",
              input: { question: "First question?" },
            },
            {
              type: "tool-input-available",
              dynamic: true,
              toolCallId: "question-2",
              toolName: "answerQuestion",
              input: { question: "Second question?" },
            },
          ]),
        ),
      ),
    };
    const hostTool = definePetrinautAiInteractiveTool({
      toolName: "answerQuestion",
      inputSchema: {
        parse: (raw: unknown) => raw as { question: string },
      },
      outputSchema: {
        parse: (raw: unknown) => raw as { answer: string },
      },
      fromComposerText: ({ text }) => ({ answer: text }),
      component: ({ input }) => <span>{input.question}</span>,
    });

    renderTestPanel({
      aiAssistant: {
        interactiveTools: [hostTool],
        renderComposerControl: ({ submitText }) => (
          <button
            type="button"
            onClick={() => {
              void submitText({ text: "Ambiguous answer" }).catch(() => {});
            }}
          >
            Submit ambiguous text
          </button>
        ),
        transport,
      },
      initialMessage: "Start ambiguous questions",
    });
    await screen.findByText("First question?");
    await screen.findByText("Second question?");

    fireEvent.click(
      screen.getByRole("button", { name: "Submit ambiguous text" }),
    );

    expect(
      await screen.findByText(
        "Text matches more than one pending interactive AI tool.",
      ),
    ).not.toBeNull();
    expect(transport.sendMessages).toHaveBeenCalledOnce();
  });
});

describe("AiAssistantPanel host interactive tools", () => {
  test("adds one dynamic output and sends one automatic follow-up", async () => {
    const requestMessages: PetrinautAiMessage[][] = [];
    const transport: PetrinautAiTransport = {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: vi.fn(({ messages }) => {
        requestMessages.push(structuredClone(messages));
        return Promise.resolve(
          streamChunks(
            requestMessages.length === 1
              ? [
                  { type: "start-step" },
                  {
                    type: "tool-input-available",
                    dynamic: true,
                    toolCallId: "host-tool-call-1",
                    toolName: "confirmRelease",
                    input: { question: "Ship this change?" },
                  },
                ]
              : [
                  { type: "start-step" },
                  { type: "text-start", id: "follow-up" },
                  {
                    type: "text-delta",
                    id: "follow-up",
                    delta: "Release decision received.",
                  },
                  { type: "text-end", id: "follow-up" },
                ],
          ),
        );
      }),
    };
    const hostTool = definePetrinautAiInteractiveTool({
      toolName: "confirmRelease",
      inputSchema: {
        parse: (raw: unknown) => raw as { question: string },
      },
      outputSchema: {
        parse: (raw: unknown) => raw as { approved: boolean },
      },
      component: ({ input, submit, toolCallId }) => (
        <button
          type="button"
          onClick={() => {
            submit({ approved: true });
            submit({ approved: true });
          }}
        >
          {`${toolCallId}: ${input.question}`}
        </button>
      ),
    });
    const handle = createJsonDocHandle({
      id: "interactive-tool-test",
      initial: emptySDCPN,
    });
    const instance = createPetrinaut({ document: handle });
    const sdcpnContext: SDCPNContextValue = {
      createNewNet: () => {},
      existingNets: [],
      loadPetriNet: () => {},
      petriNetId: "interactive-tool-test",
      petriNetDefinition: emptySDCPN,
      readonly: false,
      extensions: DEFAULT_PETRINAUT_EXTENSIONS,
      setTitle: () => {},
      title: "Interactive tool test",
      getItemType: () => null,
    };

    try {
      render(
        <PetrinautInstanceContext.Provider value={instance}>
          <EditorContext.Provider value={editorContextValue}>
            <SDCPNContext.Provider value={sdcpnContext}>
              <AiAssistantPanel
                aiAssistant={{ interactiveTools: [hostTool], transport }}
                initialMessage="Start the review"
              />
            </SDCPNContext.Provider>
          </EditorContext.Provider>
        </PetrinautInstanceContext.Provider>,
      );

      fireEvent.click(
        await screen.findByRole("button", {
          name: "host-tool-call-1: Ship this change?",
        }),
      );

      await screen.findByText("Release decision received.");
      await waitFor(() =>
        expect(transport.sendMessages).toHaveBeenCalledTimes(2),
      );

      const followUpParts = requestMessages[1]?.at(-1)?.parts ?? [];
      const submittedToolParts = followUpParts.filter(
        (part) =>
          part.type === "dynamic-tool" &&
          part.toolCallId === "host-tool-call-1" &&
          part.state === "output-available",
      );
      expect(submittedToolParts).toHaveLength(1);
      expect(submittedToolParts[0]).toMatchObject({
        output: { approved: true },
        toolCallId: "host-tool-call-1",
        toolName: "confirmRelease",
      });
    } finally {
      instance.dispose();
    }
  });
});
