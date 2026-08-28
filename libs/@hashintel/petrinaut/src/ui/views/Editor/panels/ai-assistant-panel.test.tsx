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
import { AiAssistantPanel } from "./ai-assistant-panel";

import type { PetrinautAiAssistant } from "../../../petrinaut";
import type {
  PetrinautAiComposerControlContext,
  PetrinautAiInteractionMode,
  PetrinautAiInterviewStageContext,
} from "../../../types/ai-assistant-composer-control";
import type {
  PetrinautAiMessage,
  PetrinautAiTransport,
} from "./ai-assistant-panel/types";
import type { UIMessageChunk } from "ai";

let interviewStageMounts = 0;
let interviewStageUnmounts = 0;

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
  initialInteractionMode?: PetrinautAiInteractionMode;
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
  ) => (
    <PetrinautInstanceContext.Provider value={instance}>
      <EditorContext.Provider value={nextEditorContext}>
        <SDCPNContext.Provider value={sdcpnContext}>
          <AiAssistantPanel
            aiAssistant={nextAiAssistant}
            initialInteractionMode={initialInteractionMode}
            initialMessage={initialMessage}
            onInitialInteractionModeConsumed={onInitialInteractionModeConsumed}
          />
        </SDCPNContext.Provider>
      </EditorContext.Provider>
    </PetrinautInstanceContext.Provider>
  );
  const rendered = render(renderPanel(aiAssistant, editorContext));

  return {
    ...rendered,
    rerenderPanel: (
      nextAiAssistant: PetrinautAiAssistant,
      nextEditorContext = editorContext,
    ) => rendered.rerender(renderPanel(nextAiAssistant, nextEditorContext)),
  };
};

afterEach(() => {
  cleanup();
  for (const instance of testInstances.splice(0)) {
    instance.dispose();
  }
});

describe("AiAssistantPanel composer submissions", () => {
  test("redocks one mounted interview stage when the sidebar closes and reopens", () => {
    interviewStageMounts = 0;
    interviewStageUnmounts = 0;
    const Stage = ({ placement }: { placement: string }) => {
      useEffect(() => {
        interviewStageMounts += 1;
        return () => {
          interviewStageUnmounts += 1;
        };
      }, []);
      return <div>{`Stage ${placement}`}</div>;
    };
    const aiAssistant: PetrinautAiAssistant = {
      renderInterviewStage: ({ placement }) => <Stage placement={placement} />,
      transport: {
        reconnectToStream: () => Promise.resolve(null),
        sendMessages: vi.fn(),
      },
    };
    const rendered = renderTestPanel({ aiAssistant });

    expect(screen.getByText("Stage sidebar")).not.toBeNull();
    rendered.rerenderPanel(aiAssistant, {
      ...editorContextValue,
      isAiAssistantOpen: false,
    });
    expect(screen.getByText("Stage detached")).not.toBeNull();
    rendered.rerenderPanel(aiAssistant, editorContextValue);

    expect(screen.getByText("Stage sidebar")).not.toBeNull();
    expect(interviewStageMounts).toBe(1);
    expect(interviewStageUnmounts).toBe(0);
  });

  test("switches modes without unmounting the interview stage", () => {
    interviewStageMounts = 0;
    interviewStageUnmounts = 0;
    const Stage = (context: PetrinautAiInterviewStageContext) => {
      useEffect(() => {
        interviewStageMounts += 1;
        return () => {
          interviewStageUnmounts += 1;
        };
      }, []);
      return (
        <button
          type="button"
          onClick={() => context.setInteractionMode("chat")}
        >
          {`Stage ${context.interactionMode}`}
        </button>
      );
    };
    const aiAssistant: PetrinautAiAssistant = {
      renderInterviewStage: (context) => <Stage {...context} />,
      transport: {
        reconnectToStream: () => Promise.resolve(null),
        sendMessages: vi.fn(),
      },
    };

    renderTestPanel({ aiAssistant });

    fireEvent.click(screen.getByRole("button", { name: "Interview" }));
    expect(screen.getByText("Stage interview")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stage interview" }));

    expect(
      screen.getByPlaceholderText("Describe the process you want to create"),
    ).not.toBeNull();
    expect(interviewStageMounts).toBe(1);
    expect(interviewStageUnmounts).toBe(0);
  });

  test("moves focus to the composer only when the interview stage requests it", () => {
    const Stage = (context: PetrinautAiInterviewStageContext) => (
      <>
        <button
          type="button"
          onClick={() => context.setInteractionMode("chat")}
        >
          Minimize interview
        </button>
        <button
          type="button"
          onClick={() => {
            context.setInteractionMode("chat");
            context.focusComposer();
          }}
        >
          Use text instead
        </button>
      </>
    );
    const aiAssistant: PetrinautAiAssistant = {
      renderInterviewStage: (context) => <Stage {...context} />,
      transport: {
        reconnectToStream: () => Promise.resolve(null),
        sendMessages: vi.fn(),
      },
    };

    renderTestPanel({ aiAssistant });
    fireEvent.click(screen.getByRole("button", { name: "Interview" }));

    const minimizeButton = screen.getByRole("button", {
      name: "Minimize interview",
    });
    minimizeButton.focus();
    fireEvent.click(minimizeButton);

    expect(document.activeElement).toBe(minimizeButton);

    fireEvent.click(screen.getByRole("button", { name: "Interview" }));
    fireEvent.click(screen.getByRole("button", { name: "Use text instead" }));

    expect(document.activeElement).toBe(
      screen.getByPlaceholderText("Describe the process you want to create"),
    );
  });

  test("defers and consumes an initial Interview mode once, then falls back to Chat", () => {
    let latestInteractionMode = "chat";
    const onInitialInteractionModeConsumed = vi.fn();
    const aiAssistant: PetrinautAiAssistant = {
      renderInterviewStage: (context) => {
        latestInteractionMode = context.interactionMode;
        return <div>Interview stage</div>;
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
      initialInteractionMode: "interview",
      onInitialInteractionModeConsumed,
    });

    expect(latestInteractionMode).toBe("chat");
    expect(onInitialInteractionModeConsumed).not.toHaveBeenCalled();

    rendered.rerenderPanel(aiAssistant, editorContextValue);

    expect(latestInteractionMode).toBe("interview");
    expect(onInitialInteractionModeConsumed).toHaveBeenCalledOnce();

    const unavailableAssistant: PetrinautAiAssistant = {
      transport: aiAssistant.transport,
    };
    rendered.rerenderPanel(unavailableAssistant, editorContextValue);

    expect(screen.queryByText("Interview stage")).toBeNull();
    expect(
      screen.getByPlaceholderText("Describe the process you want to create"),
    ).not.toBeNull();
    expect(onInitialInteractionModeConsumed).toHaveBeenCalledOnce();
  });

  test("accepts one interview answer while generic chat is streaming and submits it after settlement", async () => {
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
                for (const chunk of textChunks("question", "Question ready")) {
                  controller.enqueue(chunk);
                }
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
    let latestStageContext: PetrinautAiInterviewStageContext | undefined;

    renderTestPanel({
      aiAssistant: {
        renderInterviewStage: (context) => {
          latestStageContext = context;
          return (
            <button
              type="button"
              onClick={() => {
                void (context.status === "ready"
                  ? context.submitText({ text: "Begin" })
                  : context.submitInterviewAnswer({
                      target: "message",
                      text: "Queued interview answer",
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
    expect(latestStageContext?.canAcceptInterviewAnswer).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Answer now" }));
    await waitFor(() =>
      expect(latestStageContext?.canAcceptInterviewAnswer).toBe(false),
    );
    expect(requests).toHaveLength(1);

    await act(async () => firstStreamController?.close());
    await screen.findByText("Answer accepted");

    expect(requests).toHaveLength(2);
    expect(latestStageContext?.status).toBe("streaming");
    expect(latestStageContext?.canAcceptInterviewAnswer).toBe(true);
    expect(requests[1]?.at(-1)).toMatchObject({
      role: "user",
      parts: [{ type: "text", text: "Queued interview answer" }],
    });

    void latestStageContext?.submitInterviewAnswer({
      target: "message",
      text: "Next interview answer",
    });
    await waitFor(() =>
      expect(latestStageContext?.canAcceptInterviewAnswer).toBe(false),
    );
    expect(requests).toHaveLength(2);

    await act(async () => secondStreamController?.close());
    await screen.findByText("Next answer accepted");
    expect(requests).toHaveLength(3);
  });

  test("reopens the interview answer buffer when the conversation changes", async () => {
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
    let latestStageContext: PetrinautAiInterviewStageContext | undefined;
    const createAiAssistant = (
      conversationId: string,
    ): PetrinautAiAssistant => ({
      conversationId,
      renderInterviewStage: (context) => {
        latestStageContext = context;
        return null;
      },
      transport,
    });
    const rendered = renderTestPanel({
      aiAssistant: createAiAssistant("conversation-1"),
    });
    let initialSubmission: Promise<unknown> | undefined;
    act(() => {
      initialSubmission = latestStageContext?.submitText({ text: "Begin" });
    });
    void initialSubmission?.catch(() => undefined);
    await waitFor(() => expect(latestStageContext?.status).toBe("streaming"));
    let queuedAnswer: Promise<unknown> | undefined;
    act(() => {
      queuedAnswer = latestStageContext?.submitInterviewAnswer({
        target: "message",
        text: "Queued interview answer",
      });
    });
    const queuedAnswerRejection = expect(queuedAnswer).rejects.toThrow(
      "The interview conversation changed.",
    );
    await waitFor(() =>
      expect(latestStageContext?.canAcceptInterviewAnswer).toBe(false),
    );

    rendered.rerenderPanel(createAiAssistant("conversation-2"));

    await queuedAnswerRejection;
    await waitFor(() =>
      expect(latestStageContext?.canAcceptInterviewAnswer).toBe(true),
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

  test("queues one voice input while the current response is streaming", async () => {
    const requestMessages: PetrinautAiMessage[][] = [];
    let finishFirstResponse: (() => void) | undefined;
    const transport: PetrinautAiTransport = {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: vi.fn(({ messages }) => {
        requestMessages.push(structuredClone(messages));
        if (requestMessages.length > 1) {
          return Promise.resolve(
            streamChunks(textChunks("voice-response", "Voice input accepted")),
          );
        }

        return Promise.resolve(
          new ReadableStream<UIMessageChunk>({
            start(controller) {
              controller.enqueue({ type: "start-step" });
              controller.enqueue({ type: "text-start", id: "first-response" });
              controller.enqueue({
                type: "text-delta",
                id: "first-response",
                delta: "First response",
              });
              finishFirstResponse = () => {
                controller.enqueue({
                  type: "text-end",
                  id: "first-response",
                });
                controller.close();
              };
            },
          }),
        );
      }),
    };

    renderTestPanel({
      aiAssistant: {
        renderComposerControl: ({ submitText, submitVoiceInput }) => (
          <>
            <button
              type="button"
              onClick={() => {
                void submitText({ text: "Start generic response" });
              }}
            >
              Start generic response
            </button>
            <button
              type="button"
              onClick={() => {
                void submitVoiceInput({
                  id: "queued-voice-turn",
                  text: "Queued voice turn",
                });
              }}
            >
              Submit queued voice input
            </button>
          </>
        ),
        transport,
      },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Start generic response" }),
    );
    await screen.findByText("First response");
    fireEvent.click(
      screen.getByRole("button", { name: "Submit queued voice input" }),
    );

    expect(requestMessages).toHaveLength(1);
    finishFirstResponse?.();

    await screen.findByText("Voice input accepted");
    expect(requestMessages).toHaveLength(2);
    expect(requestMessages[1]?.at(-1)).toMatchObject({
      id: "queued-voice-turn",
      parts: [{ text: "Queued voice turn", type: "text" }],
      role: "user",
    });
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

  test("maps text to one unresolved host tool before sending another message", async () => {
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
    const aiAssistant: PetrinautAiAssistant = {
      interactiveTools: [hostTool],
      renderComposerControl: ({ submitText }) => (
        <button
          type="button"
          onClick={() => {
            void submitText({ id: "voice-answer-1", text: "Production" }).then(
              (result) => results.push(result),
            );
          }}
        >
          Submit answer text
        </button>
      ),
      transport,
    };

    renderTestPanel({ aiAssistant, initialMessage: "Start questions" });
    await screen.findByText("Which environment?");

    fireEvent.click(screen.getByRole("button", { name: "Submit answer text" }));
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
    expect(results).toEqual([
      { kind: "interactive-tool", toolCallId: "question-1" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Submit answer text" }));
    await screen.findByText("Ordinary text accepted");

    expect(requestMessages[2]?.at(-1)).toMatchObject({
      id: "voice-answer-1",
      parts: [{ text: "Production", type: "text" }],
      role: "user",
    });
    expect(results).toEqual([
      { kind: "interactive-tool", toolCallId: "question-1" },
      { kind: "message", messageId: "voice-answer-1" },
    ]);
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
