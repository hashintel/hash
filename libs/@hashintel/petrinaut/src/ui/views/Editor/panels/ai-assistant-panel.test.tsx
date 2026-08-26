/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
  PetrinautAiMessage,
  PetrinautAiTransport,
} from "./ai-assistant-panel/types";
import type { UIMessageChunk } from "ai";

const emptySDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
  subnets: [],
  componentInstances: [],
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

const testInstances: ReturnType<typeof createPetrinaut>[] = [];

const renderTestPanel = ({
  aiAssistant,
  initialMessage,
}: {
  aiAssistant: PetrinautAiAssistant;
  initialMessage?: string;
}) => {
  const handle = createJsonDocHandle({
    id: "ai-assistant-panel-test",
    initial: emptySDCPN,
  });
  const instance = createPetrinaut({ document: handle });
  testInstances.push(instance);
  const sdcpnContext: SDCPNContextValue = {
    createNewNet: () => {},
    existingNets: [],
    loadPetriNet: () => {},
    petriNetId: "ai-assistant-panel-test",
    petriNetDefinition: emptySDCPN,
    readonly: false,
    extensions: DEFAULT_PETRINAUT_EXTENSIONS,
    setTitle: () => {},
    title: "AI assistant panel test",
    getItemType: () => null,
  };

  render(
    <PetrinautInstanceContext.Provider value={instance}>
      <EditorContext.Provider value={editorContextValue}>
        <SDCPNContext.Provider value={sdcpnContext}>
          <AiAssistantPanel
            aiAssistant={aiAssistant}
            initialMessage={initialMessage}
          />
        </SDCPNContext.Provider>
      </EditorContext.Provider>
    </PetrinautInstanceContext.Provider>,
  );
};

afterEach(() => {
  cleanup();
  for (const instance of testInstances.splice(0)) {
    instance.dispose();
  }
});

describe("AiAssistantPanel composer submissions", () => {
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
