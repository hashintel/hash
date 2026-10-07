/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render as renderElement,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import {
  createElement,
  type ReactElement,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "@hashintel/petrinaut-core";
import {
  PetrinautAssistantWindowPreview,
  type PluginAssistantTab,
} from "@hashintel/petrinaut/ui";

import {
  createEmptyTestInstance,
  createTestPluginApi,
} from "../../testing/create-test-plugin-api";
import { definePetrinautAiInteractiveTool } from "../interactive-tool";
import { AssistantChatApiContext } from "./chat-api";
import { ChatView } from "./chat-view";
import { createVoiceSessionStore, VoiceSessionContext } from "./voice-session";

import type { PetrinautAiMessage } from "../ai-message";

const renderMarkdown = vi.hoisted(() => vi.fn());
let voiceModeMounts = 0;
let voiceModeUnmounts = 0;

vi.mock("react-markdown", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-markdown")>();

  return {
    ...actual,
    default: (props: Parameters<typeof actual.default>[0]) => {
      renderMarkdown();
      return createElement(actual.default, props);
    },
  };
});

const noop = () => {};

/** The toasts the chat asks for, through its `api`. */
const notify = vi.fn((_input: unknown) => "notification-id");
const chatApi = createTestPluginApi(createEmptyTestInstance(), { notify });
const WithChatApi = ({ children }: { children: ReactNode }) => (
  <AssistantChatApiContext value={chatApi}>{children}</AssistantChatApiContext>
);
const render = (ui: ReactElement) =>
  renderElement(ui, { wrapper: WithChatApi });
const expandWork = async () => {
  for (const fold of screen.queryAllByRole("button", {
    name: /^Activity/u,
  })) {
    if (fold.getAttribute("aria-expanded") === "false") fireEvent.click(fold);
    await waitFor(() =>
      expect(fold.getAttribute("aria-expanded")).toBe("true"),
    );
  }
  for (const tools of screen.queryAllByRole("button", {
    name: /^Used \d+ tools?/u,
  })) {
    if (tools.getAttribute("aria-expanded") === "false") fireEvent.click(tools);
    await waitFor(() =>
      expect(tools.getAttribute("aria-expanded")).toBe("true"),
    );
  }
};
const initialClipboardDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);

// The voice ribbon asks for a 2D context on mount. jsdom has no canvas, and
// answering with `null` takes the same branch a browser without one would,
// instead of letting jsdom log a not-implemented error per render.
beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      public disconnect() {}
      public observe() {}
      public unobserve() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  if (initialClipboardDescriptor === undefined) {
    Reflect.deleteProperty(navigator, "clipboard");
  } else {
    Object.defineProperty(navigator, "clipboard", initialClipboardDescriptor);
  }
});

const HostContent = ({ onMount }: { onMount: () => void }) => {
  useEffect(onMount, [onMount]);
  return <p>Saved account</p>;
};
const HostControl = ({
  onMount,
  onUnmount,
}: {
  onMount: () => void;
  onUnmount: () => void;
}) => {
  useEffect(() => {
    onMount();
    return onUnmount;
  }, [onMount, onUnmount]);
  return <span>Host control</span>;
};
/**
 * Hosts the chat's window as the editor does, with a control that reopens it
 * after its Close button closed it. `open` overrides the open state.
 */
const TestWindow = ({
  tabs,
  open,
  children,
}: {
  tabs?: readonly PluginAssistantTab[];
  open?: boolean;
  children: ReactNode;
}) => {
  const [isOpen, setOpen] = useState(true);

  return (
    <PetrinautAssistantWindowPreview
      tabs={tabs}
      state={{ isOpen: open ?? isOpen, close: () => setOpen(false) }}
    >
      <button type="button" onClick={() => setOpen(true)}>
        Reopen assistant
      </button>
      {children}
    </PetrinautAssistantWindowPreview>
  );
};

const hostTab = (label: string, content: ReactNode): PluginAssistantTab => ({
  id: "host",
  label,
  content,
});

describe("ChatView", () => {
  test("orders optional voice slots around work and produced cards", async () => {
    const card = definePetrinautAiInteractiveTool({
      toolName: "draft",
      placement: "card",
      inputSchema: { parse: (raw: unknown) => raw },
      outputSchema: { parse: (raw: unknown) => raw },
      component: () => (
        <section aria-label="Drafted experiment">Experiment draft</section>
      ),
    });
    const { container, rerender } = render(
      <ChatView
        input=""
        inputMode="voice"
        interactiveTools={[card]}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        presentation="brunch"
        status="ready"
        messages={[
          {
            id: "mediated",
            role: "assistant",
            parts: [
              {
                type: "data-brief",
                data: {
                  fields: { goal: "Compare staff", stillOpen: "Arrival rate" },
                  state: "done",
                },
              },
              {
                type: "data-voiceAgentReply",
                data: { text: "I’ll ask Brunch.", state: "done" },
              },
              { type: "reasoning", text: "Compare the ranges.", state: "done" },
              { type: "text", text: "Written answer", state: "done" },
              {
                type: "dynamic-tool",
                toolName: "draft",
                toolCallId: "draft-1",
                state: "output-available",
                input: {},
                output: {},
              },
              {
                type: "data-voiceAgentWrapUp",
                data: { text: "Your draft is ready.", state: "streaming" },
              },
            ],
          },
        ]}
      />,
    );
    expect(container.textContent).toMatch(
      /Request sent[\s\S]*I’ll ask Brunch\.[\s\S]*Activity[\s\S]*Written answer[\s\S]*Experiment draft[\s\S]*Your draft is ready\./u,
    );
    expect(
      screen
        .getByText("Written answer")
        .closest('[data-work-status="settled"]'),
    ).not.toBeNull();
    expect(
      screen
        .getByRole("region", { name: "Drafted experiment" })
        .closest("[data-work-status]"),
    ).toBeNull();
    const brief = screen.getByText("Request sent").closest("details");
    expect(brief?.open).toBe(false);
    fireEvent.click(screen.getByText("Request sent"));
    expect(screen.getByText("Arrival rate")).not.toBeNull();
    rerender(
      <ChatView
        input=""
        inputMode="voice"
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        presentation="brunch"
        status="ready"
        messages={[
          {
            id: "plain",
            role: "assistant",
            parts: [{ type: "text", text: "Plain reply" }],
          },
        ]}
      />,
    );
    expect(screen.queryByText("Request sent")).toBeNull();
    expect(screen.queryByText("I’ll ask Brunch.")).toBeNull();
    await expandWork();
    expect(screen.getByText("Plain reply")).not.toBeNull();
  });

  test("stopped work counts tools and exposes status dots, arguments and results", async () => {
    render(
      <ChatView
        input=""
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        presentation="brunch"
        status="ready"
        messages={[
          {
            id: "stopped-tools",
            role: "assistant",
            metadata: { stopped: true },
            parts: [
              {
                type: "dynamic-tool",
                toolName: "removeOld",
                toolCallId: "ok",
                state: "output-available",
                input: { id: "old" },
                output: { title: "Removed old node" },
              },
              {
                type: "dynamic-tool",
                toolName: "read",
                toolCallId: "error",
                state: "output-error",
                input: {},
                errorText: "Read failed",
              },
              {
                type: "dynamic-tool",
                toolName: "check",
                toolCallId: "pending",
                state: "input-available",
                input: { revision: 7 },
              },
            ],
          },
        ]}
      />,
    );
    const list = screen.getByRole("button", { name: "Stopped after 3 tools" });
    expect(list.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(list);
    const completed = await screen.findByRole("button", {
      name: /Removed old node/u,
    });
    expect(completed.querySelector('[data-tool-status="ok"]')).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: /Read failed/u })
        .querySelector('[data-tool-status="error"]'),
    ).not.toBeNull();
    const pending = screen.getByRole("button", { name: /check.*Cancelled/u });
    expect(
      pending.querySelector('[data-tool-status="cancelled"]'),
    ).not.toBeNull();
    expect(pending.getAttribute("aria-busy")).not.toBe("true");
    expect(screen.getByText("Response stopped")).not.toBeNull();
    fireEvent.click(pending);
    await waitFor(() =>
      expect(pending.getAttribute("aria-expanded")).toBe("true"),
    );
    expect(screen.getByText(/"revision": 7/u)).not.toBeNull();
  });

  test("shows every counted tool without scrolling inside Activity", async () => {
    const toolNames = ["one", "two", "three", "four", "five"];
    const { container } = render(
      <ChatView
        input=""
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        presentation="brunch"
        status="ready"
        messages={[
          {
            id: "five-tools",
            role: "assistant",
            parts: [
              ...toolNames.map((toolName) => ({
                type: "dynamic-tool" as const,
                toolName,
                toolCallId: toolName,
                state: "output-available" as const,
                input: {},
                output: {},
              })),
              { type: "text" as const, text: "Done" },
            ],
          },
        ]}
      />,
    );
    await expandWork();

    expect(screen.getByRole("button", { name: "Used 5 tools" })).not.toBeNull();
    for (const toolName of toolNames)
      expect(
        screen.getByRole("button", {
          name: new RegExp(`\\b${toolName}\\b`, "u"),
        }),
      ).not.toBeNull();
    const details = container.querySelector("[data-work-details]");
    expect(details?.className).not.toContain("max-h_");
    expect(details?.className).not.toContain("ov-y_auto");
  });

  test("marks unfinished stock tools cancelled after a stop", () => {
    render(
      <ChatView
        input=""
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        presentation="stock"
        status="ready"
        stopped
        messages={[
          {
            id: "stopped-stock-tools",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolName: "check",
                toolCallId: "pending",
                state: "input-available",
                input: { revision: 7 },
              },
            ],
          },
        ]}
      />,
    );
    const pending = screen.getByRole("button", { name: /check.*Cancelled/u });
    expect(
      pending.querySelector('[data-tool-status="cancelled"]'),
    ).not.toBeNull();
    expect(pending.getAttribute("aria-busy")).not.toBe("true");
  });

  test("keeps the stopped note out of a user turn stopped before any reply", () => {
    render(
      <ChatView
        input=""
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        presentation="brunch"
        status="ready"
        stopped
        messages={[
          {
            id: "unanswered",
            role: "user",
            parts: [{ type: "text", text: "Add a queue" }],
          },
        ]}
      />,
    );
    const [note, ...rest] = screen.getAllByText("Response stopped");
    expect(rest).toHaveLength(0);
    expect(note?.closest('[data-role="user"]')).toBeNull();
    expect(note?.parentElement).toBe(screen.getByTestId("ai-transcript"));
  });

  test.each([
    ["brunch", "true"],
    ["stock", null],
  ] as const)(
    "sets the compact Stop marker for the %s presentation to %s",
    (presentation, dataStop) => {
      render(
        <ChatView
          input=""
          messages={[]}
          onClose={noop}
          onInputChange={noop}
          onStop={noop}
          onSubmit={noop}
          presentation={presentation}
          status="streaming"
        />,
      );
      expect(
        screen
          .getByRole("button", { name: "Stop AI response" })
          .getAttribute("data-stop"),
      ).toBe(dataStop);
    },
  );

  test.each([true, false])(
    "keeps Brunch activity and tools open=%s across streamed steps and completion",
    async (open) => {
      const reasoning = {
        type: "reasoning" as const,
        text: "Inspect the queues.",
        state: "streaming" as const,
      };
      const tool = {
        type: "dynamic-tool" as const,
        toolName: "read",
        toolCallId: "read-1",
        input: {},
        state: "input-available" as const,
      };
      const turn = (
        parts: PetrinautAiMessage["parts"],
        status: "streaming" | "ready" = "streaming",
      ) => (
        <ChatView
          primaryLabel="Chat"
          presentation="brunch"
          input=""
          onClose={noop}
          onInputChange={noop}
          onStop={noop}
          onSubmit={noop}
          status={status}
          messages={[{ id: "working", role: "assistant", parts }]}
        />
      );
      const { rerender } = render(turn([reasoning, tool]));
      const activity = screen.getByRole("button", { name: "Working…" });
      const tools = screen.getByRole("button", { name: "Running tools" });
      const thought = screen.getByRole("button", { name: "Thinking" });
      if (!open) {
        fireEvent.click(thought);
        fireEvent.click(tools);
        fireEvent.click(activity);
      }
      const completedReasoning = { ...reasoning, state: "done" as const };
      const completedTool = {
        ...tool,
        state: "output-available" as const,
        output: { places: 3 },
      };
      const firstAnswer = {
        type: "text" as const,
        text: "There are three queues.",
        state: "streaming" as const,
      };
      const stages: PetrinautAiMessage["parts"][] = [
        [completedReasoning, completedTool, firstAnswer],
        [completedReasoning, completedTool, firstAnswer, reasoning],
        [
          completedReasoning,
          completedTool,
          firstAnswer,
          reasoning,
          { ...tool, toolCallId: "read-2" },
        ],
        [
          completedReasoning,
          completedTool,
          firstAnswer,
          completedReasoning,
          { ...completedTool, toolCallId: "read-2" },
        ],
      ];
      for (const [index, parts] of stages.entries()) {
        await act(async () => {
          rerender(
            turn(parts, index === stages.length - 1 ? "ready" : "streaming"),
          );
        });
        await waitFor(() => {
          for (const disclosure of [activity, tools, thought]) {
            expect(disclosure.isConnected).toBe(true);
            expect(disclosure.getAttribute("aria-expanded")).toBe(String(open));
          }
        });
      }
    },
  );

  test("reveals a new approval after Brunch activity was manually collapsed", async () => {
    const props = {
      primaryLabel: "Chat",
      presentation: "brunch" as const,
      input: "",
      onClose: noop,
      onInputChange: noop,
      onStop: noop,
      onSubmit: noop,
      status: "streaming" as const,
      interactiveTools: [
        definePetrinautAiInteractiveTool({
          toolName: "confirm",
          inputSchema: { parse: (value: unknown) => value },
          outputSchema: { parse: (value: unknown) => value },
          component: () => <button type="button">Approve change</button>,
        }),
      ],
    };
    const message: PetrinautAiMessage = {
      id: "approval-turn",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "Inspect queues.", state: "streaming" },
      ],
    };
    const { rerender } = render(<ChatView {...props} messages={[message]} />);
    const activity = screen.getByRole("button", { name: "Working…" });
    fireEvent.click(activity);
    await waitFor(() =>
      expect(activity.getAttribute("aria-expanded")).toBe("false"),
    );
    await act(async () => {
      rerender(
        <ChatView
          {...props}
          messages={[
            {
              ...message,
              parts: [
                ...message.parts,
                {
                  type: "dynamic-tool",
                  toolName: "confirm",
                  toolCallId: "confirmation",
                  input: {},
                  state: "input-available",
                },
              ],
            },
          ]}
        />,
      );
    });
    expect(activity.textContent).toBe("Approval required");
    await waitFor(() =>
      expect(activity.getAttribute("aria-expanded")).toBe("true"),
    );
    expect(screen.getByRole("button", { name: "Approve change" })).toBeTruthy();
  });

  test("opens running tools, then settles stock work while the answer streams", async () => {
    const props = {
      input: "",
      onClose: noop,
      onInputChange: noop,
      onStop: noop,
      onSubmit: noop,
      presentation: "brunch" as const,
      status: "streaming" as const,
    };
    const tool = {
      type: "dynamic-tool" as const,
      toolName: "read",
      toolCallId: "read-1",
      input: {},
    };
    const { rerender } = render(
      <ChatView
        {...props}
        messages={[
          {
            id: "working",
            role: "assistant",
            parts: [{ ...tool, state: "input-available" }],
          },
        ]}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: "Running tools" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    rerender(
      <ChatView
        {...props}
        messages={[
          {
            id: "working",
            role: "assistant",
            parts: [
              { ...tool, state: "output-available", output: { places: 3 } },
              { type: "text", text: "The model has", state: "streaming" },
            ],
          },
        ]}
      />,
    );
    expect(
      screen.getByText("The model has").closest("[data-work-status]"),
    ).toBeNull();
    rerender(
      <ChatView
        {...props}
        messages={[
          {
            id: "working",
            role: "assistant",
            parts: [
              { type: "text", text: "First I will inspect it.", state: "done" },
              { ...tool, state: "input-available" },
            ],
          },
        ]}
      />,
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Working…" })
          .getAttribute("aria-expanded"),
      ).toBe("true"),
    );
  });

  test("keeps the prepared brief below, not inside, the user bubble", () => {
    render(
      <ChatView
        input=""
        inputMode="voice"
        presentation="brunch"
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
        messages={[
          {
            id: "brief-user",
            role: "user",
            parts: [
              { type: "text", text: "Compare three agents" },
              {
                type: "data-brief",
                data: { fields: { goal: "Staffing" }, state: "done" },
              },
            ],
          },
        ]}
      />,
    );
    const bubble = screen
      .getByText("Compare three agents")
      .closest("[data-user-bubble]");
    expect(bubble).not.toBeNull();
    expect(bubble?.contains(screen.getByText("Request sent"))).toBe(false);
  });

  test("copies an answer and retries its own user prompt rather than the latest prompt", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const onRetryPrompt = vi.fn();
    render(
      <ChatView
        input="Unsent draft"
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        onRetryPrompt={onRetryPrompt}
        presentation="brunch"
        status="ready"
        messages={[
          {
            id: "first-question",
            role: "user",
            parts: [{ type: "text", text: "Explain the queue" }],
          },
          {
            id: "first-answer",
            role: "assistant",
            parts: [{ type: "text", text: "The **queue** holds requests." }],
          },
          {
            id: "second-question",
            role: "user",
            parts: [{ type: "text", text: "Explain the agents" }],
          },
          {
            id: "second-answer",
            role: "assistant",
            parts: [{ type: "text", text: "Agents serve requests." }],
          },
        ]}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Copy answer" })[0]!);
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledExactlyOnceWith(
        "The **queue** holds requests.",
      ),
    );
    expect(
      screen.getByRole("button", { name: "Answer copied" }),
    ).not.toBeNull();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Retry answer" })[0]!,
    );
    expect(onRetryPrompt).toHaveBeenCalledExactlyOnceWith("Explain the queue");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "Unsent draft",
    );
  });

  test("withholds Retry while another answer is streaming", () => {
    render(
      <ChatView
        input=""
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        onRetryPrompt={vi.fn()}
        presentation="brunch"
        status="streaming"
        messages={[
          {
            id: "question",
            role: "user",
            parts: [{ type: "text", text: "Explain the queue" }],
          },
          {
            id: "answer",
            role: "assistant",
            parts: [{ type: "text", text: "The queue holds requests." }],
          },
          {
            id: "follow-up",
            role: "user",
            parts: [{ type: "text", text: "Explain the agents" }],
          },
          {
            id: "streaming",
            role: "assistant",
            parts: [{ type: "text", text: "Agents", state: "streaming" }],
          },
        ]}
      />,
    );
    expect(screen.queryByRole("button", { name: "Retry answer" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Copy answer" })).toHaveLength(
      1,
    );
  });

  test("switches to host content without unmounting chat or losing its draft and Stop control", () => {
    const onStop = vi.fn();
    const contentMounted = vi.fn();
    render(
      <TestWindow
        tabs={[hostTab("Workpiece", <HostContent onMount={contentMounted} />)]}
      >
        <ChatView
          input="Unsent question"
          status="streaming"
          messages={[
            {
              id: "reply",
              role: "assistant",
              parts: [{ type: "text", text: "Ongoing conversation" }],
            },
          ]}
          onClose={noop}
          onInputChange={noop}
          onStop={onStop}
          onSubmit={noop}
        />
      </TestWindow>,
    );
    const transcript = screen.getByRole("tabpanel", { name: "AI" });
    const composer = screen.getByRole("textbox", {
      name: "Message AI assistant",
    });
    fireEvent.click(screen.getByRole("tab", { name: "Workpiece" }));
    expect(transcript.hidden).toBe(true);
    expect(
      screen.getByRole("tabpanel", { name: "Workpiece" }).textContent,
    ).toContain("Saved account");
    expect(screen.getByRole("textbox", { name: "Message AI assistant" })).toBe(
      composer,
    );
    expect((composer as HTMLTextAreaElement).value).toBe("Unsent question");
    fireEvent.click(screen.getByRole("button", { name: "Stop AI response" }));
    expect(onStop).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    expect(screen.getByRole("tabpanel", { name: "AI" })).toBe(transcript);
    expect(contentMounted).toHaveBeenCalledOnce();
  });

  test.each(["output-available", "output-error"] as const)(
    "preserves %s applied/error presentation",
    async (state) => {
      render(
        <ChatView
          input=""
          status="ready"
          onClose={noop}
          onInputChange={noop}
          onStop={noop}
          onSubmit={noop}
          messages={[
            {
              id: "assistant-outcome",
              role: "assistant",
              parts: [
                {
                  type: "dynamic-tool",
                  toolName: "updateArcWeight",
                  toolCallId: "outcome",
                  input: {},
                  ...(state === "output-error"
                    ? {
                        state: "output-error",
                        errorText: "Canonical execution failed",
                      }
                    : {
                        state: "output-available",
                        output: {
                          applied: true,
                          title: "Updated arc weight",
                          detail: "Observed value: 2",
                        },
                      }),
                },
              ],
            },
          ]}
        />,
      );
      await expandWork();
      const row = screen.getByRole("button", {
        name:
          state === "output-error"
            ? /Canonical execution failed/u
            : /Updated arc weight/u,
      });
      expect(row.getAttribute("data-tone")).toBe(
        state === "output-error" ? "danger" : "success",
      );
      expect(screen.queryByText("Not applied")).toBeNull();
    },
  );
  test("refocuses an open assistant on request and focuses the panel while Voice is compact", () => {
    const props = {
      input: "Keep this draft",
      messages: [],
      onClose: noop,
      onInputChange: noop,
      onStop: noop,
      onSubmit: noop,
      status: "ready" as const,
    };
    const { rerender } = render(
      <>
        <input aria-label="Other input" />
        <ChatView {...props} composerFocusRequest={0} />
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Message AI assistant" });
    expect(document.activeElement).toBe(input);
    screen.getByRole("textbox", { name: "Other input" }).focus();
    rerender(
      <>
        <input aria-label="Other input" />
        <ChatView {...props} composerFocusRequest={1} />
      </>,
    );
    expect(document.activeElement).toBe(input);
    expect((input as HTMLTextAreaElement).value).toBe("Keep this draft");
    rerender(
      <>
        <input aria-label="Other input" />
        <ChatView
          {...props}
          composerFocusRequest={2}
          inputMode="voice"
          voiceDockCollapsed
          voiceMode={<div>Voice setup</div>}
        />
      </>,
    );
    expect(document.activeElement).toBe(
      screen.getByRole("complementary", { name: "AI assistant" }),
    );
  });

  test("keeps the draft, transcript, and host controls mounted through docking and closing", () => {
    const mount = vi.fn();
    const unmount = vi.fn();
    const stop = vi.fn();
    const Chat = () => {
      const [input, setInput] = useState("");

      return (
        <ChatView
          composerControl={<HostControl onMount={mount} onUnmount={unmount} />}
          input={input}
          messages={[
            {
              id: "streaming-reply",
              role: "assistant",
              parts: [
                {
                  type: "text",
                  text: "The infection rate",
                  state: "streaming",
                },
              ],
            },
          ]}
          onInputChange={setInput}
          onStop={stop}
          onSubmit={noop}
          status="streaming"
        />
      );
    };
    render(
      <TestWindow tabs={[hostTab("Workpiece", <p>Saved model account</p>)]}>
        <Chat />
      </TestWindow>,
    );
    const panel = screen.getByRole("complementary", { name: "AI assistant" });
    const textarea = screen.getByRole("textbox", {
      name: "Message AI assistant",
    });
    const transcript = screen.getByTestId("ai-transcript");
    fireEvent.change(textarea, { target: { value: "Keep this draft" } });
    fireEvent.click(screen.getByRole("tab", { name: "Workpiece" }));
    const workpiece = screen.getByRole("tabpanel", { name: "Workpiece" });
    expect(panel.getAttribute("data-placement")).toBe("docked");
    fireEvent.click(screen.getByRole("button", { name: "Float AI assistant" }));
    expect(panel.getAttribute("data-placement")).toBe("floating");
    fireEvent.click(screen.getByRole("button", { name: "Close AI assistant" }));
    fireEvent.click(screen.getByRole("button", { name: "Reopen assistant" }));
    expect(panel.getAttribute("data-placement")).toBe("floating");
    fireEvent.click(screen.getByRole("button", { name: "Dock AI assistant" }));
    expect(panel.getAttribute("data-placement")).toBe("docked");
    const panelWidth = panel.style.width;
    fireEvent.click(screen.getByRole("button", { name: "Close AI assistant" }));
    expect(panel.style.width).toBe(panelWidth);
    expect(panel.hasAttribute("inert")).toBe(true);
    expect(
      screen.queryByRole("textbox", { name: "Message AI assistant" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reopen assistant" }));
    expect(panel.hasAttribute("inert")).toBe(false);
    expect(screen.getByRole("tabpanel", { name: "Workpiece" })).toBe(workpiece);
    expect(workpiece.textContent).toContain("Saved model account");
    expect(transcript.closest("[hidden]")).not.toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    expect(screen.getByRole("textbox", { name: "Message AI assistant" })).toBe(
      textarea,
    );
    expect((textarea as HTMLTextAreaElement).value).toBe("Keep this draft");
    expect(screen.getByTestId("ai-transcript")).toBe(transcript);
    expect(screen.getByText("The infection rate")).not.toBeNull();
    expect(mount).toHaveBeenCalledTimes(1);
    expect(unmount).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Stop AI response" }));
    expect(stop).toHaveBeenCalledOnce();
  });

  test("labels stopped history after a later completed reply without global Stop state", () => {
    render(
      <ChatView
        input=""
        status="ready"
        stopped={false}
        presentation="brunch"
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        messages={[
          {
            id: "aborted",
            role: "assistant",
            metadata: { stopped: true },
            parts: [{ type: "text", text: "Partial reply" }],
          },
          {
            id: "completed-later",
            role: "assistant",
            parts: [{ type: "text", text: "Later completed reply" }],
          },
        ]}
      />,
    );
    expect(screen.getByText("Partial reply")).not.toBeNull();
    expect(screen.getByText("Later completed reply")).not.toBeNull();
    expect(screen.getAllByText("Stopped")).toHaveLength(1);
  });

  test("keeps non-Voice assistant errors in global notifications", () => {
    const message =
      'Elicitor failed.\nCaused by: {"field":"answer","reason":"Required"}';
    render(
      <ChatView
        error={new Error(message)}
        input=""
        messages={[]}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="error"
      />,
    );

    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith({
      detail: message,
      message: "AI assistant error",
      tone: "error",
    });
    expect(
      screen.queryByRole("button", { name: /Show .*Voice issue/ }),
    ).toBeNull();
    expect(
      within(screen.getByTestId("ai-transcript")).queryByText(message),
    ).toBeNull();
  });

  test("keeps one Voice mode slot mounted across tab switches and panel closure", () => {
    voiceModeMounts = 0;
    voiceModeUnmounts = 0;
    const Stage = () => {
      useEffect(() => {
        voiceModeMounts += 1;
        return () => {
          voiceModeUnmounts += 1;
        };
      }, []);
      return <div>Voice mode</div>;
    };
    const props = {
      input: "",
      messages: [] as PetrinautAiMessage[],
      onClose: noop,
      onInputChange: noop,
      onStop: noop,
      onSubmit: noop,
      status: "ready" as const,
      voiceMode: <Stage />,
    };
    const tabs = [hostTab("Notes", <p>Saved notes</p>)];
    const { rerender } = render(
      <TestWindow tabs={tabs} open>
        <ChatView {...props} />
      </TestWindow>,
    );

    expect(screen.getByText("Voice mode")).not.toBeNull();
    // The host slot sits outside the scrolling transcript so consent and
    // start-up chrome stay pinned above the composer.
    const voiceSlot = screen.getByTestId("ai-voice-mode");
    const transcript = screen.getByTestId("ai-transcript");
    expect(transcript.contains(voiceSlot)).toBe(false);
    const panelRows = [...voiceSlot.parentElement!.children];
    expect(panelRows.indexOf(voiceSlot)).toBeGreaterThan(
      panelRows.indexOf(transcript.parentElement!),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Notes" }));
    expect(screen.getByTestId("ai-voice-mode")).toBe(voiceSlot);
    expect(screen.getByText("Voice mode")).not.toBeNull();
    rerender(
      <TestWindow tabs={tabs} open={false}>
        <ChatView {...props} />
      </TestWindow>,
    );

    expect(
      screen
        .getByRole("complementary", { hidden: true })
        .getAttribute("aria-hidden"),
    ).toBe("true");
    expect(voiceModeMounts).toBe(1);
    expect(voiceModeUnmounts).toBe(0);
  });

  test("shows spoken turns live and collapses an active session without unmounting the panel", () => {
    const store = createVoiceSessionStore();
    const onCollapsedVoiceEnd = vi.fn();
    const actions = {
      end: vi.fn(),
      pause: vi.fn(),
      reconnect: vi.fn(),
      resume: vi.fn(),
      setMicrophoneMuted: vi.fn(),
    };
    store.setActions(actions);
    store.setState({
      errorMessage: null,
      microphoneLevel: 0,
      microphoneMuted: false,
      phase: "listening",
    });
    const earlierMessages = [
      {
        id: "assistant-earlier",
        role: "assistant",
        parts: [{ type: "text", text: "Earlier answer" }],
      },
    ] as PetrinautAiMessage[];
    const liveMessages = [
      ...earlierMessages,
      {
        id: "spoken-user",
        metadata: { source: "voice" },
        role: "user",
        parts: [{ type: "text", text: "Spoken request" }],
      },
      {
        id: "spoken-assistant",
        role: "assistant",
        parts: [{ type: "text", text: "Spoken reply" }],
      },
      {
        id: "typed-user",
        role: "user",
        parts: [{ type: "text", text: "Typed aside" }],
      },
    ] as PetrinautAiMessage[];
    const VoiceContents = ({
      inputMode = "voice",
      messages,
    }: {
      inputMode?: "text" | "voice";
      messages: PetrinautAiMessage[];
    }) => {
      const [collapsed, setCollapsed] = useState(false);

      return (
        <VoiceSessionContext.Provider value={store}>
          <ChatView
            input=""
            inputMode={inputMode}
            messages={messages}
            onClose={noop}
            onCollapsedVoiceEnd={onCollapsedVoiceEnd}
            onInputChange={noop}
            onStop={noop}
            onSubmit={noop}
            onVoiceDockCollapsedChange={setCollapsed}
            presentation="brunch"
            status="ready"
            voiceDockCollapsed={collapsed}
            voiceMode={<div>Host Voice controls</div>}
          />
        </VoiceSessionContext.Provider>
      );
    };

    const { rerender } = render(<VoiceContents messages={earlierMessages} />);

    const dock = screen.getByRole("region", { name: "Voice session" });
    expect(within(dock).getByText("Listening")).not.toBeNull();
    expect(
      screen.queryByRole("textbox", { name: "Message AI assistant" }),
    ).toBeNull();
    expect(screen.getByText("Earlier answer")).not.toBeNull();
    expect(
      within(dock)
        .getByRole("button", { name: "Hide conversation" })
        .getAttribute("aria-expanded"),
    ).toBeNull();

    rerender(<VoiceContents messages={liveMessages} />);

    expect(screen.getByText("Spoken request")).not.toBeNull();
    expect(screen.getByText("Spoken reply")).not.toBeNull();
    expect(screen.getByText("Typed aside")).not.toBeNull();

    const transcript = screen.getByTestId("ai-transcript");
    const voiceMode = screen.getByTestId("ai-voice-mode");
    const header = screen
      .getByRole("button", { name: "Close AI assistant" })
      .closest("div")!;

    fireEvent.click(
      within(dock).getByRole("button", { name: "Hide conversation" }),
    );

    expect(actions.end).not.toHaveBeenCalled();
    expect(actions.pause).not.toHaveBeenCalled();
    expect(actions.reconnect).not.toHaveBeenCalled();
    expect(actions.resume).not.toHaveBeenCalled();
    expect(actions.setMicrophoneMuted).not.toHaveBeenCalled();
    expect(screen.getByTestId("ai-transcript")).toBe(transcript);
    expect(screen.getByTestId("ai-voice-mode")).toBe(voiceMode);
    expect(
      screen
        .getByRole("button", { name: "Close AI assistant", hidden: true })
        .closest("div"),
    ).toBe(header);
    expect(transcript.parentElement!.className).toContain("d_none");
    expect(voiceMode.className).toContain("d_none");
    expect(header.className).toContain("d_none");

    fireEvent.click(
      within(dock).getByRole("button", { name: "End voice mode" }),
    );

    expect(actions.end).toHaveBeenCalledOnce();
    expect(onCollapsedVoiceEnd).toHaveBeenCalledOnce();

    fireEvent.click(
      within(dock).getByRole("button", { name: "Show conversation" }),
    );

    expect(transcript.parentElement!.className).not.toContain("d_none");
    expect(voiceMode.className).not.toContain("d_none");
    expect(header.className).not.toContain("d_none");
    expect(screen.getByText("Spoken request")).not.toBeNull();
    expect(actions.end).toHaveBeenCalledOnce();
    expect(actions.pause).not.toHaveBeenCalled();
    expect(actions.reconnect).not.toHaveBeenCalled();
    expect(actions.resume).not.toHaveBeenCalled();
    expect(actions.setMicrophoneMuted).not.toHaveBeenCalled();

    fireEvent.click(
      within(dock).getByRole("button", { name: "End voice mode" }),
    );

    expect(actions.end).toHaveBeenCalledTimes(2);
    expect(onCollapsedVoiceEnd).toHaveBeenCalledOnce();

    act(() => store.setState(null));
    rerender(<VoiceContents inputMode="text" messages={liveMessages} />);

    expect(screen.getByText("Spoken request")).not.toBeNull();
    expect(screen.getByText("Spoken reply")).not.toBeNull();
    expect(screen.queryByRole("region", { name: "Voice session" })).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Message AI assistant" }),
    ).not.toBeNull();
  });

  test("stacks Voice setup above its compact dock while keeping the full panel mounted", () => {
    const onVoiceDockCollapsedChange = vi.fn();
    render(
      <ChatView
        input=""
        inputMode="voice"
        messages={[]}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        onVoiceDockCollapsedChange={onVoiceDockCollapsedChange}
        status="ready"
        voiceDockCollapsed
        voiceMode={
          <section aria-label="Voice mode consent">Permission</section>
        }
      />,
    );

    const permission = screen.getByRole("region", {
      name: "Voice mode consent",
    });
    const setupDock = screen.getByRole("region", { name: "Voice setup" });
    expect(within(setupDock).queryByText(/connecting/i)).toBeNull();
    expect(within(setupDock).getByText("Voice setup")).not.toBeNull();
    expect(permission.parentElement?.nextElementSibling).toBe(
      setupDock.parentElement,
    );
    expect(
      screen.getByTestId("ai-transcript").parentElement!.className,
    ).toContain("d_none");
    expect(
      screen
        .getByRole("button", { name: "Close AI assistant", hidden: true })
        .closest("div")?.className,
    ).toContain("d_none");
    expect(
      screen.getByRole("textbox", {
        hidden: true,
        name: "Message AI assistant",
      }),
    ).not.toBeNull();

    const expandButton = within(setupDock).getByRole("button", {
      name: "Expand voice setup",
    });
    expect(expandButton.getAttribute("aria-expanded")).toBeNull();
    fireEvent.click(expandButton);

    expect(onVoiceDockCollapsedChange).toHaveBeenCalledWith(false);
  });

  test("toggles interruption by speaking in audio options and reveals manual handover", async () => {
    const store = createVoiceSessionStore();
    const state = {
      canTakeTurn: true,
      interruptionBySpeaking: true,
      errorMessage: null,
      microphoneLevel: 0,
      microphoneMuted: false,
      phase: "speaking" as const,
    };
    const setInterruptionBySpeaking = vi.fn((enabled: boolean) =>
      store.setState({ ...state, interruptionBySpeaking: enabled }),
    );
    store.setActions({
      end: vi.fn(),
      pause: vi.fn(),
      reconnect: vi.fn(),
      resume: vi.fn(),
      setMicrophoneMuted: vi.fn(),
      takeTurn: vi.fn(),
      setInterruptionBySpeaking,
    });
    store.setState(state);
    render(
      <VoiceSessionContext.Provider value={store}>
        <ChatView
          input=""
          messages={[]}
          onClose={noop}
          onInputChange={noop}
          onStop={noop}
          onSubmit={noop}
          status="ready"
        />
      </VoiceSessionContext.Provider>,
    );
    expect(screen.queryByRole("button", { name: "Your turn" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Audio options" }));
    const preference = await screen.findByRole<HTMLInputElement>("checkbox", {
      name: "Allow interruptions",
    });
    expect(preference.checked).toBe(true);
    expect(preference.closest("div")?.querySelector("svg")).not.toBeNull();
    fireEvent.click(preference);
    await waitFor(() =>
      expect(setInterruptionBySpeaking).toHaveBeenCalledWith(false),
    );
    expect(screen.queryByText("Audio options")).toBeNull();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(preference.checked).toBe(false);
    expect(screen.getByRole("button", { name: "Your turn" })).not.toBeNull();
    fireEvent.click(preference);
    await waitFor(() =>
      expect(setInterruptionBySpeaking).toHaveBeenLastCalledWith(true),
    );
    expect(preference.checked).toBe(true);
    expect(screen.queryByRole("button", { name: "Your turn" })).toBeNull();
  });

  test("keeps Realtime playback and independent audio controls in the Voice dock", async () => {
    const store = createVoiceSessionStore();
    const actions = {
      end: vi.fn(),
      pause: vi.fn(),
      readFullResponse: vi.fn(),
      reconnect: vi.fn(),
      repeatQuestion: vi.fn(),
      resume: vi.fn(),
      setInterruptionBySpeaking: vi.fn(),
      setMicrophoneMuted: vi.fn(),
      setSpeakerMuted: vi.fn(),
      setSpeakerVolume: vi.fn(),
      takeTurn: vi.fn(),
    };
    store.setActions(actions);
    store.setState({
      canReadFullResponse: true,
      canRepeatQuestion: true,
      canTakeTurn: true,
      errorMessage: null,
      microphoneLevel: 0.4,
      microphoneMuted: false,
      phase: "speaking",
      speakerMuted: false,
      speakerVolume: 0.4,
    });
    render(
      <VoiceSessionContext.Provider value={store}>
        <ChatView
          input=""
          messages={[]}
          onClose={noop}
          onInputChange={noop}
          onStop={noop}
          onSubmit={noop}
          status="streaming"
        />
      </VoiceSessionContext.Provider>,
    );

    const dock = screen.getByRole("region", { name: "Voice session" });
    expect(within(dock).getByText("Speaking")).not.toBeNull();
    expect(
      Array.from(
        dock.querySelectorAll('[data-part="right-actions"] button'),
        (button) => button.getAttribute("aria-label"),
      ),
    ).toEqual([
      "Your turn",
      "Stop AI response",
      "Audio options",
      "Mute microphone",
      "End voice mode",
    ]);
    for (const label of [
      "Mute microphone",
      "Stop AI response",
      "End voice mode",
    ]) {
      const button = within(dock).getByRole("button", { name: label });
      const icon = button.querySelector("svg");
      expect(icon?.getAttribute("viewBox")).toBe(
        label === "Mute microphone" ? "0 0 20 20" : "0 0 24 24",
      );
      expect(icon?.getAttribute("width")).toBe("16");
      expect(icon?.getAttribute("height")).toBe("16");
      expect(within(button).queryByText(label)).toBeNull();
    }

    fireEvent.click(
      within(dock).getByRole("button", { name: "Mute microphone" }),
    );
    fireEvent.click(
      within(dock).getByRole("button", { name: "End voice mode" }),
    );
    fireEvent.click(within(dock).getByRole("button", { name: "Your turn" }));

    expect(actions.setMicrophoneMuted).toHaveBeenCalledWith(true);
    expect(actions.end).toHaveBeenCalledOnce();
    expect(actions.takeTurn).toHaveBeenCalledOnce();

    fireEvent.click(
      within(dock).getByRole("button", { name: "Audio options" }),
    );
    const repeatQuestion = await screen.findByRole("button", {
      name: "Repeat question",
    });
    fireEvent.click(repeatQuestion);
    expect(actions.repeatQuestion).toHaveBeenCalledOnce();

    const readFullResponse = screen.getByRole("button", {
      name: "Read full reply",
    });
    fireEvent.click(readFullResponse);
    expect(actions.readFullResponse).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("checkbox", { name: "Allow interruptions" }),
    ).not.toBeNull();

    const speakerMute = screen.getByRole("button", { name: "Mute speaker" });
    expect(speakerMute.querySelector("svg")).not.toBeNull();
    expect(within(speakerMute).queryByText("Mute speaker")).toBeNull();
    fireEvent.click(speakerMute);
    expect(actions.setSpeakerMuted).toHaveBeenCalledWith(true);
    expect(actions.setSpeakerVolume).not.toHaveBeenCalled();

    const volume = screen.getByRole("slider", { name: "Speaker volume" });
    expect(screen.getByText("40%")).not.toBeNull();
    volume.focus();
    fireEvent.keyDown(volume, { key: "ArrowRight" });
    await waitFor(() =>
      expect(actions.setSpeakerVolume).toHaveBeenCalledWith(0.45),
    );
    expect(actions.setSpeakerMuted).toHaveBeenCalledTimes(1);
    actions.setSpeakerMuted.mockClear();
    fireEvent.keyDown(volume, { key: "Home" });
    await waitFor(() =>
      expect(actions.setSpeakerVolume).toHaveBeenCalledWith(0),
    );
    expect(actions.setSpeakerMuted).not.toHaveBeenCalled();
    expect(
      within(dock)
        .getByRole("button", { name: "Mute microphone" })
        .closest('[data-scope="popover"][data-part="content"]'),
    ).toBeNull();

    act(() => {
      store.setState({
        errorMessage: null,
        microphoneLevel: 0,
        microphoneMuted: true,
        phase: "speaking",
        speakerMuted: true,
        speakerVolume: 0.4,
      });
    });

    expect(within(dock).getByText("Speaking")).not.toBeNull();
    const speakerUnmute = screen.getByRole("button", {
      name: "Unmute speaker",
    });
    expect(speakerUnmute.querySelector("svg")).not.toBeNull();
    expect(within(speakerUnmute).queryByText("Unmute speaker")).toBeNull();
    fireEvent.click(
      within(dock).getByRole("button", { name: "Unmute microphone" }),
    );

    expect(actions.setMicrophoneMuted).toHaveBeenLastCalledWith(false);

    act(() => {
      store.setState({
        errorMessage: null,
        microphoneLevel: 0,
        microphoneMuted: false,
        notice: "We didn't catch that. Try again.",
        phase: "listening",
      });
    });
    expect(
      within(dock).getByRole("status", { name: "Voice status" }).textContent,
    ).toBe("Voice status: We didn't catch that. Try again.");
    expect(
      within(dock).getByText("We didn't catch that. Try again."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Show .*Voice issue/ }),
    ).toBeNull();
    act(() => {
      store.setState({
        errorMessage: null,
        microphoneLevel: 0,
        microphoneMuted: false,
        notice: null,
        phase: "listening",
      });
    });
    expect(within(dock).getByText("Listening")).toBeTruthy();
  });

  test("shows live Stop only while busy and keeps it independent from End", () => {
    const store = createVoiceSessionStore();
    const end = vi.fn();
    const onStop = vi.fn();
    store.setActions({ end, pause: noop });
    store.setState({
      errorMessage: null,
      microphoneLevel: 0,
      microphoneMuted: false,
      phase: "speaking",
    });
    const props = {
      input: "",
      messages: [] as PetrinautAiMessage[],
      onClose: noop,
      onInputChange: noop,
      onStop,
      onSubmit: noop,
    };
    const rendered = render(
      <VoiceSessionContext.Provider value={store}>
        <ChatView {...props} status="ready" />
      </VoiceSessionContext.Provider>,
    );

    expect(
      screen.queryByRole("button", { name: "Stop AI response" }),
    ).toBeNull();

    rendered.rerender(
      <VoiceSessionContext.Provider value={store}>
        <ChatView {...props} status="submitted" />
      </VoiceSessionContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Stop AI response" }));
    expect(onStop).toHaveBeenCalledOnce();
    expect(end).not.toHaveBeenCalled();

    rendered.rerender(
      <VoiceSessionContext.Provider value={store}>
        <ChatView {...props} status="streaming" />
      </VoiceSessionContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Stop AI response" }));
    expect(onStop).toHaveBeenCalledTimes(2);
    expect(end).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "End voice mode" }));
    expect(end).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledTimes(2);

    rendered.rerender(
      <VoiceSessionContext.Provider value={store}>
        <ChatView {...props} status="error" />
      </VoiceSessionContext.Provider>,
    );
    expect(
      screen.queryByRole("button", { name: "Stop AI response" }),
    ).toBeNull();
  });

  test("defaults speaker state safely and restores audio-trigger focus", async () => {
    const store = createVoiceSessionStore();
    const setSpeakerMuted = vi.fn();
    const setSpeakerVolume = vi.fn();
    store.setActions({
      end: vi.fn(),
      pause: noop,
      setSpeakerMuted,
      setSpeakerVolume,
    });
    store.setState({
      errorMessage: null,
      microphoneLevel: 0,
      microphoneMuted: false,
      phase: "connected",
    });
    render(
      <>
        <VoiceSessionContext.Provider value={store}>
          <ChatView
            input=""
            messages={[]}
            onClose={noop}
            onInputChange={noop}
            onStop={noop}
            onSubmit={noop}
            status="ready"
          />
        </VoiceSessionContext.Provider>
        <button type="button">Outside audio options</button>
      </>,
    );

    const trigger = screen.getByRole("button", { name: "Audio options" });
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() =>
      expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(
        true,
      ),
    );
    const speakerMute = screen.getByRole("button", {
      name: "Mute speaker",
    });
    expect(speakerMute.getAttribute("aria-pressed")).toBe("false");
    const volume = screen.getByRole("slider", { name: "Speaker volume" });
    expect(volume.getAttribute("aria-valuenow")).toBe("100");

    volume.focus();
    fireEvent.keyDown(volume, { key: "ArrowLeft" });
    await waitFor(() => expect(setSpeakerVolume).toHaveBeenCalledWith(0.95));
    expect(setSpeakerMuted).not.toHaveBeenCalled();

    fireEvent.keyDown(volume, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("slider", { name: "Speaker volume" }),
      ).toBeNull(),
    );
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    await waitFor(() =>
      expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(
        true,
      ),
    );
    const reopenedVolume = screen.getByRole("slider", {
      name: "Speaker volume",
    });
    expect(reopenedVolume).not.toBeNull();
    const outside = screen.getByRole("button", {
      name: "Outside audio options",
    });
    await waitFor(() => {
      fireEvent.pointerDown(outside, {
        button: 0,
        clientX: 100,
        clientY: 100,
        isPrimary: true,
        pointerType: "mouse",
      });
      expect(
        screen.queryByRole("slider", { name: "Speaker volume" }),
      ).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });

  test.each([
    "Couldn’t confirm your message was sent. Check the conversation before sending it again.",
    "Those words weren’t sent. They’re in the composer to send when the assistant is ready.",
  ])(
    "contains a session warning in the warning popover until dismissed: %s",
    async (warningMessage) => {
      const store = createVoiceSessionStore();
      const state = {
        errorMessage: null,
        microphoneLevel: 0,
        microphoneMuted: false,
        phase: "connected" as const,
        warningMessage,
      };
      store.setState(state);
      const end = vi.fn();
      store.setActions({ end, pause: noop, setSpeakerVolume: vi.fn() });
      render(
        <VoiceSessionContext.Provider value={store}>
          <ChatView
            input=""
            inputMode="voice"
            messages={[]}
            onClose={noop}
            onInputChange={noop}
            onStop={noop}
            onSubmit={noop}
            status="ready"
            voiceDockCollapsed
          />
        </VoiceSessionContext.Provider>,
      );
      const dock = screen.getByTestId("ai-voice-dock");
      expect(
        within(dock)
          .getAllByRole("button")
          .slice(0, 3)
          .map((button) => button.getAttribute("aria-label")),
      ).toEqual(["Show conversation", "Show 1 Voice issue", "Audio options"]);
      act(() => store.setActions({ end, pause: noop }));
      expect(
        within(dock)
          .getAllByRole("button")
          .slice(0, 2)
          .map((button) => button.getAttribute("aria-label")),
      ).toEqual(["Show conversation", "Show 1 Voice issue"]);
      expect(within(dock).getByText("Connected")).toBeTruthy();
      expect(screen.queryByText(warningMessage)).toBeNull();
      expect(within(dock).getByRole("status").textContent).toBe(
        "Voice status: Connected",
      );
      fireEvent.click(
        within(dock).getByRole("button", { name: "Show 1 Voice issue" }),
      );
      const warningTitle = warningMessage.split(". ")[0] ?? warningMessage;
      expect(await screen.findByText(warningTitle)).toBeTruthy();
      expect(within(dock).queryByText(warningMessage)).toBeNull();
      expect(
        screen.getByText(warningTitle).closest('[data-scope="toast"]'),
      ).toBeNull();
      act(() => {
        store.setState({ ...state, phase: "thinking", microphoneLevel: 0.5 });
      });
      expect(screen.getAllByText(warningTitle)).toHaveLength(1);
      act(() => {
        store.setState({ ...state, warningMessage: null });
      });
      expect(screen.getByText(warningTitle)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
      expect(screen.queryByText(warningMessage)).toBeNull();
      expect(
        screen.queryByRole("button", { name: /Show .*Voice issue/ }),
      ).toBeNull();
      fireEvent.click(
        within(dock).getByRole("button", { name: "End voice mode" }),
      );
      expect(end).toHaveBeenCalledOnce();
    },
  );

  test("contains voice failures in the collapsed dock without a toast", async () => {
    const store = createVoiceSessionStore();
    store.setState({
      errorMessage: "Microphone unavailable. Check your browser permissions.",
      microphoneLevel: 0,
      microphoneMuted: false,
      phase: "error",
    });
    render(
      <VoiceSessionContext.Provider value={store}>
        <ChatView
          input=""
          messages={[]}
          onClose={noop}
          onInputChange={noop}
          onStop={noop}
          onSubmit={noop}
          status="ready"
          voiceDockCollapsed
        />
      </VoiceSessionContext.Provider>,
    );

    const dock = screen.getByTestId("ai-voice-dock");
    fireEvent.click(
      within(dock).getByRole("button", { name: "Show 1 Voice issue" }),
    );
    expect(await screen.findByText("Microphone unavailable")).toBeTruthy();
    expect(
      document.querySelector('[data-scope="toast"][data-part="root"]'),
    ).toBeNull();
  });

  test("deduplicates voice failures locally and never calls the shared notifier", () => {
    const store = createVoiceSessionStore();
    const errorState = {
      errorMessage: "Microphone unavailable. Check your browser permissions.",
      microphoneLevel: 0,
      microphoneMuted: false,
      phase: "error" as const,
    };
    store.setState(errorState);
    const voiceChat = (
      <VoiceSessionContext.Provider value={store}>
        <ChatView
          input=""
          messages={[]}
          onClose={noop}
          onInputChange={noop}
          onStop={noop}
          onSubmit={noop}
          status="ready"
        />
      </VoiceSessionContext.Provider>
    );
    const { rerender } = render(voiceChat);

    expect(notify).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Show 1 Voice issue" }),
    ).toBeTruthy();
    rerender(voiceChat);
    expect(notify).not.toHaveBeenCalled();

    act(() => {
      store.setState({
        errorMessage: null,
        microphoneLevel: 0,
        microphoneMuted: false,
        phase: "listening",
      });
    });
    act(() => {
      store.setState(errorState);
    });
    expect(notify).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Show 1 Voice issue" }),
    ).toBeTruthy();
  });

  test("isolates microphone-level updates from completed transcript messages", () => {
    const VoiceLevel = () => {
      const [level, setLevel] = useState(0);
      return (
        <button type="button" onClick={() => setLevel(0.75)}>
          {`Microphone level ${level}`}
        </button>
      );
    };

    render(
      <ChatView
        input=""
        messages={[
          {
            id: "assistant-complete",
            role: "assistant",
            parts: [{ type: "text", state: "done", text: "Completed answer" }],
          },
        ]}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        presentation="brunch"
        status="ready"
        voiceMode={<VoiceLevel />}
      />,
    );

    expect(renderMarkdown).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Microphone level 0" }));
    expect(
      screen.getByRole("button", { name: "Microphone level 0.75" }),
    ).not.toBeNull();
    expect(renderMarkdown).toHaveBeenCalledOnce();
  });

  test("hides a closed chat-only panel from the accessibility tree", () => {
    const { container } = render(
      <TestWindow open={false}>
        <ChatView
          input=""
          messages={[]}
          onClose={noop}
          onInputChange={noop}
          onStop={noop}
          onSubmit={noop}
          status="ready"
        />
      </TestWindow>,
    );

    expect(
      container
        .querySelector('aside[aria-label="AI assistant"]')
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  test("keeps keyboard drafting available and protects clear-chat during active Voice mode", () => {
    render(
      <ChatView
        clearMessagesDisabled={true}
        input="Draft answer"
        inputMode="voice"
        messages={[
          {
            id: "assistant-1",
            role: "assistant",
            parts: [{ type: "text", text: "Question" }],
          },
        ]}
        onClearMessages={vi.fn()}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="streaming"
        voiceMode={<div>Active Voice mode</div>}
      />,
    );

    expect(
      screen.getByRole<HTMLTextAreaElement>("textbox", {
        name: "Message AI assistant",
      }).disabled,
    ).toBe(false);
    expect(
      screen.getByRole("complementary", { name: "AI assistant" }).className,
    ).toContain("z_[calc(var(--z-index-sticky)_+_2)]");
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Clear AI chat",
      }).disabled,
    ).toBe(true);
  });

  test("keeps one AI header, transcript, and composer visible in Voice mode", () => {
    const onInputModeChange = vi.fn();
    render(
      <ChatView
        input=""
        inputMode="voice"
        messages={[
          {
            id: "assistant-1",
            role: "assistant",
            parts: [{ type: "text", text: "Existing transcript" }],
          },
        ]}
        onClose={noop}
        onInputChange={noop}
        onInputModeChange={onInputModeChange}
        onStop={noop}
        onSubmit={noop}
        status="ready"
        voiceMode={<div>Voice mode stage</div>}
        voiceModeAvailable={true}
      />,
    );

    expect(screen.getByText("AI")).not.toBeNull();
    expect(screen.getByText("Existing transcript")).not.toBeNull();
    expect(screen.getByText("Voice mode stage")).not.toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Message AI assistant" }),
    ).not.toBeNull();
    expect(
      screen.queryByRole("group", { name: "AI interaction mode" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Chat" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Interview" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Start voice mode" }));
    expect(onInputModeChange).toHaveBeenCalledOnce();
    expect(onInputModeChange).toHaveBeenCalledWith("voice");
  });

  test("marks only spoken user messages when switching from Voice to Chat", () => {
    const contents = (inputMode: "voice" | "text") => (
      <ChatView
        input=""
        inputMode={inputMode}
        presentation="brunch"
        messages={[
          {
            id: "voice-user",
            metadata: { source: "voice" },
            role: "user",
            parts: [{ type: "text", text: "Spoken workflow" }],
          },
          {
            id: "typed-user",
            role: "user",
            parts: [{ type: "text", text: "Typed follow-up" }],
          },
          {
            id: "voice-assistant",
            metadata: { source: "voice" },
            role: "assistant",
            parts: [{ type: "text", text: "Assistant reply" }],
          },
        ]}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />
    );
    const { rerender } = render(contents("voice"));
    expect(screen.queryByRole("img", { name: "Sent using voice" })).toBeNull();
    rerender(contents("text"));
    expect(
      within(
        screen.getByText("Spoken workflow").closest("[data-role]")!,
      ).getByRole("img", { name: "Sent using voice" }),
    ).not.toBeNull();
    expect(
      screen.getAllByRole("img", { name: "Sent using voice" }),
    ).toHaveLength(1);
    expect(
      within(
        screen.getByText("Typed follow-up").closest("[data-role]")!,
      ).queryByRole("img", { name: "Sent using voice" }),
    ).toBeNull();
    rerender(contents("voice"));
    expect(screen.queryByRole("img", { name: "Sent using voice" })).toBeNull();
  });

  test("animates new spoken words without replacing earlier words or losing spacing", () => {
    const props = {
      input: "",
      onClose: noop,
      onInputChange: noop,
      onStop: noop,
      onSubmit: noop,
      presentation: "brunch" as const,
      status: "ready" as const,
    };
    const message = (text: string): PetrinautAiMessage[] => [
      {
        id: "reply",
        role: "assistant",
        parts: [
          { type: "data-voiceAgentReply", data: { state: "streaming", text } },
        ],
      },
    ];
    const view = render(
      <ChatView {...props} messages={message("I’ll  check")} />,
    );
    const first = view.container.querySelector("[data-streamed-word]");
    expect(first).not.toBeNull();
    view.rerender(
      <ChatView
        {...props}
        messages={message("I’ll  check that.\nThen compare.")}
      />,
    );
    expect(view.container.querySelector("[data-streamed-word]")).toBe(first);
    expect(
      view.container.querySelector('[data-answer="voice-reply"]')?.textContent,
    ).toBe("I’ll  check that.\nThen compare.");
  });

  test("retains spoken tool answers without per-message voice markers", () => {
    const hostTool = definePetrinautAiInteractiveTool({
      toolName: "answerQuestion",
      inputSchema: {
        parse: (raw: unknown) => raw as { question: string },
      },
      outputSchema: {
        parse: (raw: unknown) => raw as { answer: string },
      },
      component: ({ submittedOutput, toolCallId }) => (
        <span>{`${toolCallId}: ${submittedOutput?.answer}`}</span>
      ),
    });
    const messages = [
      {
        id: "assistant-questions",
        metadata: {
          source: "voice",
          voiceToolCallIds: ["question-voice-1", "question-voice-2"],
        },
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "answerQuestion",
            state: "output-available",
            toolCallId: "question-typed",
            input: { question: "Who reviews it?" },
            output: { answer: "The operator" },
          },
          {
            type: "dynamic-tool",
            toolName: "answerQuestion",
            state: "output-available",
            toolCallId: "question-voice-1",
            input: { question: "Who approves it?" },
            output: { answer: "The shift lead" },
          },
          {
            type: "dynamic-tool",
            toolName: "answerQuestion",
            state: "output-available",
            toolCallId: "question-voice-2",
            input: { question: "Who acts next?" },
            output: { answer: "The dispatcher" },
          },
        ],
      },
    ] as unknown as PetrinautAiMessage[];

    const { container } = render(
      <ChatView
        input=""
        interactiveTools={[hostTool]}
        messages={messages}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    expect(screen.queryByText("The shift lead", { exact: true })).toBeNull();
    expect(container.querySelectorAll('[data-role="user"]')).toHaveLength(0);
  });

  test("keeps completed messages memoized when interactive tools are omitted", () => {
    const messages: PetrinautAiMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", state: "done", text: "Completed response" }],
      },
    ];
    const props = {
      messages,
      onClose: noop,
      onInputChange: noop,
      onStop: noop,
      onSubmit: noop,
      status: "ready" as const,
    };

    const { rerender } = render(<ChatView {...props} input="" />);

    expect(renderMarkdown).toHaveBeenCalledOnce();

    rerender(<ChatView {...props} input="Next message" />);

    expect(renderMarkdown).toHaveBeenCalledOnce();
  });

  test("renders a host composer control between the textarea and send button", () => {
    render(
      <ChatView
        composerControl={
          <button type="button" aria-label="Alternate input">
            Alternate
          </button>
        }
        input=""
        messages={[]}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    const textarea = screen.getByRole("textbox", {
      name: "Message AI assistant",
    });
    const control = screen.getByRole("button", { name: "Alternate input" });
    const sendButton = screen.getByRole("button", { name: "Send message" });

    expect(textarea.nextElementSibling?.contains(control)).toBe(true);
    expect(control.nextElementSibling?.contains(sendButton)).toBe(true);
  });

  test("keeps one trailing Brunch composer action", () => {
    const onInputModeChange = vi.fn();
    render(
      <ChatView
        input=""
        messages={[]}
        onClose={noop}
        onInputChange={noop}
        onInputModeChange={onInputModeChange}
        onStop={noop}
        onSubmit={noop}
        primaryLabel="Chat"
        presentation="brunch"
        status="ready"
        voiceModeAvailable
      />,
    );

    const microphone = screen.getByRole("button", { name: "Start voice mode" });
    const textarea = screen.getByRole("textbox", {
      name: "Message AI assistant",
    });
    expect(screen.queryByRole("button", { name: "Send message" })).toBeNull();
    expect(textarea.closest("form")?.querySelectorAll("button")).toHaveLength(
      1,
    );
    expect(textarea.nextElementSibling?.contains(microphone)).toBe(true);
    fireEvent.click(microphone);
    expect(onInputModeChange).toHaveBeenCalledWith("voice");
  });

  test("shows Brunch work hints and hides prompt chips while work is active", () => {
    const props = {
      input: "",
      messages: [] as PetrinautAiMessage[],
      onClose: noop,
      onInputChange: noop,
      onSendPrompt: noop,
      onStop: noop,
      onSubmit: noop,
      primaryLabel: "Chat",
      presentation: "brunch" as const,
      interactiveTools: [
        definePetrinautAiInteractiveTool({
          toolName: "confirm",
          inputSchema: { parse: (value: unknown) => value },
          outputSchema: { parse: (value: unknown) => value },
          component: () => <span>Approval</span>,
        }),
      ],
      promptChips: [{ id: "review", label: "Review", prompt: "Review" }],
      status: "streaming" as const,
      voiceModeAvailable: true,
    };
    const view = render(
      <ChatView {...props} experimentStates={{ run: { active: true } }} />,
    );
    expect(screen.getByText("Experiment running")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Review" })).toBeNull();

    view.rerender(
      <ChatView
        {...props}
        experimentStates={undefined}
        messages={
          [
            {
              id: "assistant",
              role: "assistant",
              parts: [
                {
                  type: "dynamic-tool",
                  toolName: "confirm",
                  toolCallId: "approval",
                  state: "input-available",
                  input: {},
                },
              ],
            },
          ] as PetrinautAiMessage[]
        }
      />,
    );
    expect(screen.getByText("Waiting for your decision")).not.toBeNull();
    view.rerender(
      <ChatView
        {...props}
        interactiveTools={[
          definePetrinautAiInteractiveTool({
            toolName: "confirm",
            placement: "card",
            inputSchema: { parse: (value: unknown) => value },
            outputSchema: { parse: (value: unknown) => value },
            component: () => <span>Preparing a draft</span>,
          }),
        ]}
        messages={[
          {
            id: "assistant",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolName: "confirm",
                toolCallId: "draft",
                state: "input-available",
                input: {},
              },
            ],
          },
        ]}
      />,
    );
    expect(screen.queryByText("Waiting for your decision")).toBeNull();
  });

  test.each(["Chat", "AI assistant"])(
    "switches the %s trailing action from Voice mode to Send for trimmed input",
    (primaryLabel) => {
      const onInputModeChange = vi.fn();
      const onSubmit = vi.fn();
      const props = {
        messages: [] as PetrinautAiMessage[],
        onClose: noop,
        onInputChange: noop,
        onInputModeChange,
        onStop: noop,
        onSubmit,
        primaryLabel,
        status: "ready" as const,
        voiceModeAvailable: true,
      };
      const rendered = render(<ChatView {...props} input="" />);

      const voiceButton = screen.getByRole("button", {
        name: "Start voice mode",
      });
      expect(voiceButton.querySelector("svg")).not.toBeNull();
      expect(voiceButton.parentElement?.getAttribute("data-scope")).toBe(
        "tooltip",
      );
      fireEvent.click(voiceButton);

      expect(onInputModeChange).toHaveBeenCalledOnce();
      expect(onInputModeChange).toHaveBeenCalledWith("voice");
      expect(onSubmit).not.toHaveBeenCalled();

      rendered.rerender(<ChatView {...props} input="   " />);
      expect(
        screen.getByRole("button", { name: "Start voice mode" }),
      ).not.toBeNull();

      rendered.rerender(<ChatView {...props} input="  Create a queue  " />);
      expect(
        screen.queryByRole("button", { name: "Start voice mode" }),
      ).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Send message" }));

      expect(onSubmit).toHaveBeenCalledOnce();
    },
  );

  test.each(["Chat", "AI assistant"])(
    "prioritizes %s Stop and retains disabled Send without Voice mode",
    (primaryLabel) => {
      const onStop = vi.fn();
      const props = {
        input: "Draft",
        messages: [] as PetrinautAiMessage[],
        onClose: noop,
        onInputChange: noop,
        onInputModeChange: noop,
        onStop,
        onSubmit: vi.fn(),
        primaryLabel,
        status: "streaming" as const,
        voiceModeAvailable: true,
      };
      const rendered = render(<ChatView {...props} />);

      expect(
        screen.queryByRole("button", { name: "Start voice mode" }),
      ).toBeNull();
      expect(screen.queryByRole("button", { name: "Send message" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Stop AI response" }));
      expect(onStop).toHaveBeenCalledOnce();

      rendered.rerender(
        <ChatView
          {...props}
          input=""
          status="ready"
          voiceModeAvailable={false}
        />,
      );

      expect(
        screen.getByRole<HTMLButtonElement>("button", {
          name: "Send message",
        }).disabled,
      ).toBe(true);
    },
  );

  test("does not submit the draft when a host composer button omits its type", () => {
    const onSubmit = vi.fn();
    render(
      <ChatView
        composerControl={createElement(
          "button",
          // oxlint-disable-next-line react/button-has-type -- The missing type is the regression under test.
          { "aria-label": "Alternate input" },
          "Alternate",
        )}
        input="Unsaved draft"
        messages={[]}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={onSubmit}
        status="ready"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Alternate input",
      }),
    );

    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  test("renders a host interactive tool and submits its validated output once", () => {
    const parseOutput = vi.fn((raw: unknown) => {
      if (
        typeof raw !== "object" ||
        raw === null ||
        typeof (raw as { approved?: unknown }).approved !== "boolean"
      ) {
        throw new Error("Expected an approval output");
      }

      return raw as { approved: boolean };
    });
    const onInteractiveToolSubmit = vi.fn();
    const hostTool = definePetrinautAiInteractiveTool({
      toolName: "confirmRelease",
      inputSchema: {
        parse: (raw: unknown) => {
          if (
            typeof raw !== "object" ||
            raw === null ||
            typeof (raw as { question?: unknown }).question !== "string"
          ) {
            throw new Error("Expected a question");
          }

          return raw as { question: string };
        },
      },
      outputSchema: { parse: parseOutput },
      component: ({ input, state, submit, submittedOutput, toolCallId }) => (
        <div>
          <span>{`${toolCallId}:${input.question}:${state}`}</span>
          {state === "awaiting" ? (
            <button type="button" onClick={() => submit({ approved: true })}>
              Approve
            </button>
          ) : (
            <span>{submittedOutput.approved ? "Approved" : "Declined"}</span>
          )}
        </div>
      ),
    });
    const awaitingMessages = [
      {
        id: "assistant-host-tool",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "confirmRelease",
            state: "input-available",
            toolCallId: "host-tool-call-1",
            input: { question: "Ship this change?" },
          },
        ],
      },
    ] as unknown as PetrinautAiMessage[];

    const { rerender } = render(
      <ChatView
        input=""
        interactiveTools={[hostTool]}
        messages={awaitingMessages}
        onClose={noop}
        onInputChange={noop}
        onInteractiveToolSubmit={onInteractiveToolSubmit}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    expect(
      screen.getByText("host-tool-call-1:Ship this change?:awaiting"),
    ).not.toBeNull();

    const approveButton = screen.getByRole("button", { name: "Approve" });
    fireEvent.click(approveButton);
    fireEvent.click(approveButton);

    expect(parseOutput).toHaveBeenCalledOnce();
    expect(onInteractiveToolSubmit).toHaveBeenCalledOnce();
    expect(onInteractiveToolSubmit).toHaveBeenCalledWith({
      toolCallId: "host-tool-call-1",
      toolName: "confirmRelease",
      output: { approved: true },
    });

    const submittedMessages = [
      {
        ...awaitingMessages[0],
        parts: [
          {
            ...awaitingMessages[0]!.parts[0],
            state: "output-available",
            output: { approved: true },
          },
        ],
      },
    ] as unknown as PetrinautAiMessage[];

    rerender(
      <ChatView
        input=""
        interactiveTools={[hostTool]}
        messages={submittedMessages}
        onClose={noop}
        onInputChange={noop}
        onInteractiveToolSubmit={onInteractiveToolSubmit}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    expect(
      screen.getByText("host-tool-call-1:Ship this change?:submitted"),
    ).not.toBeNull();
    expect(screen.getByText("Approved")).not.toBeNull();
  });

  test("waits for complete host tool input before rendering its widget", () => {
    const parseInput = vi.fn((raw: unknown) => {
      if (
        typeof raw !== "object" ||
        raw === null ||
        typeof (raw as { question?: unknown }).question !== "string"
      ) {
        throw new Error("Expected a question");
      }

      return raw as { question: string };
    });
    const hostTool = definePetrinautAiInteractiveTool({
      toolName: "confirmRelease",
      inputSchema: { parse: parseInput },
      outputSchema: { parse: (raw: unknown) => raw },
      component: ({ input }) => <span>{input.question}</span>,
    });
    const createMessages = (
      state: "input-streaming" | "input-available",
      input: unknown,
    ) =>
      [
        {
          id: "assistant-host-tool",
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName: "confirmRelease",
              state,
              toolCallId: "host-tool-call-1",
              input,
            },
          ],
        },
      ] as unknown as PetrinautAiMessage[];

    const { rerender } = render(
      <ChatView
        input=""
        interactiveTools={[hostTool]}
        messages={createMessages("input-streaming", {})}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        presentation="brunch"
        status="streaming"
      />,
    );

    expect(parseInput).not.toHaveBeenCalled();
    expect(screen.queryByText("Ship this change?")).toBeNull();

    rerender(
      <ChatView
        input=""
        interactiveTools={[hostTool]}
        messages={createMessages("input-available", {
          question: "Ship this change?",
        })}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    expect(parseInput).toHaveBeenCalledOnce();
    expect(screen.getByText("Ship this change?")).not.toBeNull();
    expect(screen.queryByText("Running…")).toBeNull();
  });

  test("allows retry when an interactive tool output is rejected", async () => {
    const onInteractiveToolSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error("Output was not accepted"))
      .mockResolvedValueOnce(undefined);
    const hostTool = definePetrinautAiInteractiveTool({
      toolName: "confirmRelease",
      inputSchema: { parse: () => ({ question: "Ship this change?" }) },
      outputSchema: { parse: () => ({ approved: true }) },
      component: ({ submit }) => (
        <button type="button" onClick={() => submit({ approved: true })}>
          Approve
        </button>
      ),
    });
    const messages = [
      {
        id: "assistant-host-tool",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "confirmRelease",
            state: "input-available",
            toolCallId: "host-tool-call-1",
            input: { question: "Ship this change?" },
          },
        ],
      },
    ] as unknown as PetrinautAiMessage[];

    render(
      <ChatView
        input=""
        interactiveTools={[hostTool]}
        messages={messages}
        onClose={noop}
        onInputChange={noop}
        onInteractiveToolSubmit={onInteractiveToolSubmit}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    const approveButton = screen.getByRole("button", { name: "Approve" });
    fireEvent.click(approveButton);
    await waitFor(() => expect(onInteractiveToolSubmit).toHaveBeenCalledOnce());

    fireEvent.click(approveButton);
    await waitFor(() =>
      expect(onInteractiveToolSubmit).toHaveBeenCalledTimes(2),
    );
  });

  test("renders the empty assistant state", () => {
    render(
      <ChatView
        input=""
        messages={[]}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    expect(screen.getByText(/Ask AI to create a Petri net/u)).not.toBeNull();
  });

  test("holds the Activity row's place while waiting for Brunch", () => {
    const props = {
      input: "",
      messages: [
        {
          id: "request",
          role: "user",
          parts: [{ type: "text", text: "Review this model" }],
        },
      ] as PetrinautAiMessage[],
      onClose: noop,
      onInputChange: noop,
      onStop: noop,
      onSubmit: noop,
      primaryLabel: "Chat",
      presentation: "brunch" as const,
    };
    const { rerender } = render(<ChatView {...props} status="ready" />);
    const transcript = screen.getByTestId("ai-transcript");
    expect(screen.queryByTestId("brunch-response-status")).toBeNull();
    expect(within(transcript).queryByRole("status")).toBeNull();

    rerender(<ChatView {...props} status="submitted" />);
    const waiting = within(transcript).getByRole("status");
    expect(waiting.textContent).toBe("Working…");
    expect(waiting.closest('[data-work-status="pending"]')).not.toBeNull();
    expect(within(waiting).queryByRole("button")).toBeNull();
    expect(screen.queryByRole("button", { name: "Working…" })).toBeNull();
    expect(screen.queryByTestId("brunch-response-status")).toBeNull();

    rerender(
      <ChatView
        {...props}
        status="streaming"
        messages={[
          ...props.messages,
          {
            id: "response",
            role: "assistant",
            parts: [{ type: "reasoning", text: "Inspect", state: "streaming" }],
          },
        ]}
      />,
    );
    const working = screen.getByRole("button", { name: "Working…" });
    expect(working.querySelector('[data-work-status="pending"]')).toBeNull();
    expect(document.querySelector('[data-work-status="pending"]')).toBeNull();

    rerender(<ChatView {...props} status="ready" />);
    expect(within(transcript).queryByRole("status")).toBeNull();

    rerender(
      <ChatView
        {...props}
        primaryLabel="AI assistant"
        presentation="stock"
        status="submitted"
      />,
    );
    expect(screen.queryByTestId("brunch-response-status")).toBeNull();
    expect(screen.queryByRole("button", { name: "Working…" })).toBeNull();
    expect(screen.queryByText(/Brunch/u)).toBeNull();
  });

  test.each(["voice", "text"] as const)(
    "keeps Activity off Live's spoken reply message (%s)",
    (inputMode) => {
      const request: PetrinautAiMessage = {
        id: "request",
        role: "user",
        metadata: { source: "voice" },
        parts: [{ type: "text", text: "Review this model" }],
      };
      const spokenReply: PetrinautAiMessage = {
        id: "voice-reply:request",
        role: "assistant",
        metadata: { source: "voice" },
        parts: [
          {
            type: "data-voiceAgentReply",
            data: { text: "I hear you.", state: "done" },
          },
        ],
      };
      const props = {
        input: "",
        inputMode,
        onClose: noop,
        onInputChange: noop,
        onStop: noop,
        onSubmit: noop,
        primaryLabel: "Chat",
        presentation: "brunch" as const,
      };
      const replyTurn = () =>
        screen
          .getByText("I hear you.")
          .closest<HTMLElement>('[data-role="assistant"]')!;
      const { rerender } = render(
        <ChatView
          {...props}
          messages={[request, spokenReply]}
          status="submitted"
        />,
      );

      expect(replyTurn().querySelector("[data-work-status]")).toBeNull();
      const waiting = within(screen.getByTestId("ai-transcript")).getByRole(
        "status",
      );
      expect(waiting.textContent).toBe("Working…");
      expect(replyTurn().nextElementSibling?.contains(waiting)).toBe(true);

      rerender(
        <ChatView
          {...props}
          messages={[
            request,
            spokenReply,
            {
              id: "response",
              role: "assistant",
              parts: [
                { type: "reasoning", text: "Inspect", state: "streaming" },
              ],
            },
          ]}
          status="streaming"
        />,
      );

      expect(replyTurn().querySelector("[data-work-status]")).toBeNull();
      expect(screen.getAllByRole("button", { name: "Working…" })).toHaveLength(
        1,
      );
      expect(document.querySelector('[data-work-status="pending"]')).toBeNull();

      rerender(
        <ChatView
          {...props}
          messages={[request, spokenReply]}
          status="ready"
          stopped
        />,
      );

      expect(replyTurn().textContent).not.toContain("Response stopped");
      expect(screen.getByText("Response stopped")).not.toBeNull();
    },
  );

  test("keeps Brunch prompt chips mounted but inaccessible while waiting", () => {
    const props = {
      input: "",
      messages: [] as PetrinautAiMessage[],
      onClose: noop,
      onInputChange: noop,
      onSendPrompt: noop,
      onStop: noop,
      onSubmit: noop,
      primaryLabel: "Chat",
      presentation: "brunch" as const,
      promptChips: [{ id: "review", label: "Review", prompt: "Review" }],
    };
    const { rerender } = render(<ChatView {...props} status="ready" />);
    const dismiss = screen.getByRole("button", {
      name: "Dismiss quick actions",
    });
    rerender(<ChatView {...props} status="submitted" />);
    expect(dismiss.isConnected).toBe(true);
    expect(dismiss.closest("[inert]")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Review/u })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Dismiss quick actions" }),
    ).toBeNull();
    rerender(<ChatView {...props} status="ready" />);
    expect(screen.getByRole("button", { name: /Review/u })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dismiss quick actions" })).toBe(
      dismiss,
    );
  });

  test("shows an optional turn-level working label only while busy", () => {
    const props = {
      input: "",
      messages: [],
      onClose: noop,
      onInputChange: noop,
      onStop: noop,
      onSubmit: noop,
      workingLabel: "Brunch is working",
    };
    const { rerender } = render(<ChatView {...props} status="submitted" />);

    expect(screen.getByRole("status").textContent).toContain(
      "Brunch is working",
    );

    rerender(<ChatView {...props} status="streaming" />);
    expect(screen.getByRole("status").textContent).toContain(
      "Brunch is working",
    );

    rerender(<ChatView {...props} status="ready" />);
    expect(screen.queryByText("Brunch is working")).toBeNull();
  });

  test("keeps the Brunch working status visible while the host tab is selected", () => {
    render(
      <TestWindow tabs={[hostTab("Ledger", <p>Saved account</p>)]}>
        <ChatView
          input=""
          messages={[
            {
              id: "request",
              role: "user",
              parts: [{ type: "text", text: "Review this model" }],
            },
          ]}
          onClose={noop}
          onInputChange={noop}
          onStop={noop}
          onSubmit={noop}
          presentation="brunch"
          status="submitted"
        />
      </TestWindow>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Ledger" }));

    const status = screen.getByTestId("brunch-response-status");
    expect(status.textContent).toBe("Working…");
    expect(status.closest("[hidden]")).toBeNull();
    expect(
      document
        .querySelector('[data-work-status="pending"]')
        ?.closest("[hidden]"),
    ).not.toBeNull();
  });

  test("keeps the working label visible while the host tab is selected", () => {
    render(
      <TestWindow tabs={[hostTab("Ledger", <p>Saved account</p>)]}>
        <ChatView
          input=""
          messages={[]}
          onClose={noop}
          onInputChange={noop}
          onStop={noop}
          onSubmit={noop}
          status="streaming"
          workingLabel="Brunch is working"
        />
      </TestWindow>,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Ledger" }));
    expect(screen.getByRole("tabpanel", { name: "Ledger" })).not.toBeNull();
    const status = screen.getByTestId("ai-working-status");
    expect(status.textContent).toContain("Brunch is working");
    expect(status.closest("[hidden]")).toBeNull();
  });

  test("uses stock behavior for a Chat label until Brunch presentation is explicit", () => {
    const props = {
      input: "",
      messages: [],
      onClose: noop,
      onInputChange: noop,
      onStop: noop,
      onSubmit: noop,
      status: "streaming" as const,
      workingLabel: "Working",
    };
    const { rerender } = render(<ChatView {...props} />);
    expect(screen.getByTestId("ai-working-status").className).not.toContain(
      "d_none",
    );

    rerender(<ChatView {...props} primaryLabel="Chat" />);
    expect(screen.getByTestId("ai-working-status")).not.toBeNull();

    rerender(<ChatView {...props} primaryLabel="Chat" presentation="brunch" />);
    expect(screen.queryByTestId("ai-working-status")).toBeNull();
  });

  test("keeps Brunch answer cards and wrapping out of the stock presentation", () => {
    const props = {
      input: "",
      messages: [
        {
          id: "assistant-1",
          role: "assistant" as const,
          parts: [{ type: "text" as const, text: "A stock answer" }],
        },
      ],
      onClose: noop,
      onInputChange: noop,
      onSendPrompt: noop,
      onStop: noop,
      onSubmit: noop,
      promptChips: [{ id: "review", label: "Review", prompt: "Review" }],
      status: "ready" as const,
    };
    const { container, rerender } = render(<ChatView {...props} />);

    expect(container.querySelector('[data-answer="brunch"]')).toBeNull();
    expect(
      container.querySelector("[data-prompt-chips]")?.hasAttribute("data-wrap"),
    ).toBe(false);
    expect(container.querySelector("[data-prompt-chips]")?.className).toContain(
      "ov-x_auto",
    );

    rerender(<ChatView {...props} presentation="brunch" />);

    expect(container.querySelector('[data-answer="brunch"]')).not.toBeNull();
    expect(
      container.querySelector("[data-prompt-chips]")?.getAttribute("data-wrap"),
    ).toBe("true");
  });

  test("uses stock tabs for a stock assistant with an additional tab", () => {
    const props = {
      input: "",
      messages: [],
      onClose: noop,
      onInputChange: noop,
      onStop: noop,
      onSubmit: noop,
      status: "ready" as const,
    };
    const tabs = [hostTab("Ledger", <p>Ledger body</p>)];
    const { rerender } = render(
      <TestWindow tabs={tabs}>
        <ChatView {...props} />
      </TestWindow>,
    );
    const tablist = () => screen.getByRole("tablist");
    const inactiveTab = () => screen.getByRole("tab", { name: "Ledger" });

    expect(tablist().getAttribute("data-style-variant")).toBe("default");
    expect(tablist().querySelector("[data-mark]")).toBeNull();
    expect(inactiveTab().className).toContain("op_[0.6]");

    rerender(
      <TestWindow tabs={tabs}>
        <ChatView {...props} presentation="brunch" />
      </TestWindow>,
    );
    expect(tablist().getAttribute("data-style-variant")).toBe("pill");
    expect(tablist().querySelectorAll("[data-mark]")).toHaveLength(1);
    expect(inactiveTab().className).not.toContain("op_[0.6]");
  });

  test("keeps the stock transcript chrome for a stock assistant", () => {
    const props = {
      input: "",
      messages: [
        {
          id: "user-1",
          role: "user" as const,
          parts: [{ type: "text" as const, text: "A stock prompt" }],
        },
        {
          id: "assistant-1",
          role: "assistant" as const,
          parts: [{ type: "text" as const, text: "A stock answer" }],
        },
      ],
      onClose: noop,
      onInputChange: noop,
      onStop: noop,
      onSubmit: noop,
      status: "ready" as const,
    };
    const { container, rerender } = render(<ChatView {...props} />);
    const userMessage = () => container.querySelector('[data-role="user"]');
    const userBubble = () => container.querySelector("[data-user-bubble]");
    const assistantMessage = () =>
      container.querySelector('[data-role="assistant"]');

    expect(userMessage()?.className).toContain("bg-c_neutral.bg.subtle");
    expect(userBubble()).toBeNull();
    expect(assistantMessage()?.className).not.toContain("p_[6px_0]");

    rerender(<ChatView {...props} presentation="brunch" />);
    expect(userMessage()?.className).not.toContain("bg-c_neutral.bg.subtle");
    expect(userBubble()?.className).toContain("bg-c_neutral.a20");
    expect(assistantMessage()?.className).toContain("p_[6px_0]");
  });

  test("keeps the stock AI transcript label in both input modes", () => {
    const props = {
      input: "",
      messages: [],
      onClose: noop,
      onInputChange: noop,
      onStop: noop,
      onSubmit: noop,
      status: "ready" as const,
    };
    const { rerender } = render(<ChatView {...props} />);
    expect(screen.getByText("AI")).not.toBeNull();

    rerender(
      <TestWindow tabs={[hostTab("Ledger", <p>Ledger body</p>)]}>
        <ChatView {...props} inputMode="voice" />
      </TestWindow>,
    );
    expect(screen.getByRole("tab", { name: "AI" })).not.toBeNull();
  });

  test("shows the host transcript label, switching Brunch Chat to Voice", () => {
    const props = {
      input: "",
      inputMode: "voice" as const,
      messages: [],
      onClose: noop,
      onInputChange: noop,
      onStop: noop,
      onSubmit: noop,
      status: "ready" as const,
    };
    const tabs = [hostTab("Ledger", <p>Ledger body</p>)];
    const { rerender } = render(
      <TestWindow tabs={tabs}>
        <ChatView {...props} primaryLabel="Copilot" />
      </TestWindow>,
    );
    expect(screen.getByRole("tab", { name: "Copilot" })).not.toBeNull();

    rerender(
      <TestWindow tabs={tabs}>
        <ChatView {...props} primaryLabel="Chat" presentation="brunch" />
      </TestWindow>,
    );
    expect(screen.getByRole("tab", { name: "Voice" })).not.toBeNull();
  });

  test("announces spoken-turn thinking without naming the assistant", () => {
    render(
      <ChatView
        input=""
        inputMode="voice"
        messages={[
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "Build a queue" }],
          },
          {
            id: "assistant-1",
            role: "assistant",
            parts: [
              { type: "reasoning", text: "Planning", state: "streaming" },
            ],
          },
        ]}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        presentation="brunch"
        status="streaming"
      />,
    );

    expect(screen.getByRole("status", { name: "Thinking" })).not.toBeNull();
    expect(screen.queryByRole("status", { name: /Brunch/u })).toBeNull();
  });

  test("renders streamed markdown and collapsed reasoning", async () => {
    const startedAt = Date.parse("2026-05-14T12:00:00Z");
    const finishedAt = startedAt + 4_500;
    const messages: PetrinautAiMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            state: "done",
            text: "**Planning the net**\n\nUnderstanding the requested model.",
            providerMetadata: {
              petrinaut: { startedAt, finishedAt },
            },
          },
          {
            type: "text",
            state: "done",
            text: "**Created** a supply chain model.",
          },
        ],
      },
    ];

    render(
      <ChatView
        input=""
        messages={messages}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        presentation="brunch"
        status="ready"
      />,
    );

    expect(screen.getByText("Created")).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Activity" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    await expandWork();
    expect(
      screen
        .getByRole("button", { name: "Thought for 4s" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.getByText("Thought for 4s")).not.toBeNull();
    expect(screen.queryByTestId("reasoning-status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Thought for 4s" }));
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Thought for 4s" })
          .getAttribute("aria-expanded"),
      ).toBe("true"),
    );
    expect(screen.getByText("Planning the net")).not.toBeNull();
  });

  test("calls the clear handler from the header", () => {
    const onClearMessages = vi.fn();

    render(
      <ChatView
        input=""
        messages={[
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "Start over" }],
          },
        ]}
        onClearMessages={onClearMessages}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear AI chat" }));

    expect(onClearMessages).toHaveBeenCalledOnce();
  });

  test("scrolls to the latest chat content", async () => {
    // jsdom does not implement `scrollTo`, so we install a stub on the
    // prototype and restore it afterwards. The `unbound-method` lint warning
    // is a false positive — we never invoke the saved reference, we only
    // assign it back.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalScrollTo = window.HTMLElement.prototype.scrollTo;
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const scrollTo = vi.fn();
    window.HTMLElement.prototype.scrollTo = scrollTo;
    // Make rAF synchronous so the scroll effect runs before the assertion.
    window.requestAnimationFrame = (callback) => {
      callback(0);
      return 0;
    };
    window.cancelAnimationFrame = () => {};

    render(
      <ChatView
        input=""
        messages={[
          {
            id: "assistant-1",
            role: "assistant",
            parts: [{ type: "text", state: "streaming", text: "Still going" }],
          },
        ]}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="streaming"
      />,
    );

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(scrollTo).toHaveBeenCalled();
    expect(scrollTo.mock.instances).toContain(
      screen.getByTestId("ai-transcript"),
    );
    window.HTMLElement.prototype.scrollTo = originalScrollTo;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  test("auto-follows a Voice reply that grows before later parts", () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Saved only for restoration.
    const originalScrollTo = window.HTMLElement.prototype.scrollTo;
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const scrollTo = vi.fn();
    window.HTMLElement.prototype.scrollTo = scrollTo;
    window.requestAnimationFrame = (callback) => {
      callback(0);
      return 0;
    };
    const messageWithReply = (text: string): PetrinautAiMessage => ({
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "data-voiceAgentReply", data: { text, state: "streaming" } },
        { type: "reasoning", state: "streaming", text: "Checking" },
      ],
    });
    const props = {
      input: "",
      inputMode: "voice" as const,
      onClose: noop,
      onInputChange: noop,
      onStop: noop,
      onSubmit: noop,
      status: "streaming" as const,
    };
    const view = render(
      <ChatView {...props} messages={[messageWithReply("I’ll")]} />,
    );
    scrollTo.mockClear();

    view.rerender(
      <ChatView {...props} messages={[messageWithReply("I’ll ask Brunch")]} />,
    );

    expect(scrollTo.mock.instances).toContain(
      screen.getByTestId("ai-transcript"),
    );
    window.HTMLElement.prototype.scrollTo = originalScrollTo;
    window.requestAnimationFrame = originalRequestAnimationFrame;
  });

  test("does not show an empty Activity fold above a plain Chat answer", () => {
    render(
      <ChatView
        input=""
        messages={[
          {
            id: "assistant-1",
            role: "assistant",
            parts: [{ type: "text", state: "done", text: "Plain answer" }],
          },
        ]}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    expect(screen.getByText("Plain answer")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^Activity/u })).toBeNull();
  });

  test.each([
    { presentation: "brunch", follows: false },
    { presentation: "stock", follows: true },
  ] as const)(
    "$presentation presentation follows new content after the reader scrolls more than 96px from the end: $follows",
    ({ presentation, follows }) => {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- Saved only for restoration.
      const originalScrollTo = window.HTMLElement.prototype.scrollTo;
      const originalRequestAnimationFrame = window.requestAnimationFrame;
      const scrollTo = vi.fn();
      window.HTMLElement.prototype.scrollTo = scrollTo;
      window.requestAnimationFrame = (callback) => {
        callback(0);
        return 0;
      };
      const props = {
        input: "",
        messages: [
          {
            id: "assistant-1",
            role: "assistant" as const,
            parts: [
              {
                type: "text" as const,
                state: "streaming" as const,
                text: "One",
              },
            ],
          },
        ],
        onClose: noop,
        onInputChange: noop,
        onStop: noop,
        onSubmit: noop,
        presentation,
        status: "streaming" as const,
      };
      const view = render(<ChatView {...props} />);
      const transcript = screen.getByTestId("ai-transcript");
      Object.defineProperties(transcript, {
        clientHeight: { configurable: true, value: 400 },
        scrollHeight: { configurable: true, value: 1000 },
        scrollTop: { configurable: true, writable: true, value: 600 },
      });
      fireEvent.scroll(transcript);
      transcript.scrollTop = 400;
      fireEvent.scroll(transcript);
      scrollTo.mockClear();

      view.rerender(
        <ChatView
          {...props}
          messages={[
            {
              ...props.messages[0]!,
              parts: [{ type: "text", state: "streaming", text: "One two" }],
            },
          ]}
        />,
      );

      expect(scrollTo.mock.calls.length > 0).toBe(follows);
      window.HTMLElement.prototype.scrollTo = originalScrollTo;
      window.requestAnimationFrame = originalRequestAnimationFrame;
    },
  );

  test("keeps following while its smooth scroll trails content that grew mid-animation", () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Saved only for restoration.
    const originalScrollTo = window.HTMLElement.prototype.scrollTo;
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const scrollTo = vi.fn();
    window.HTMLElement.prototype.scrollTo = scrollTo;
    window.requestAnimationFrame = (callback) => {
      callback(0);
      return 0;
    };
    const props = {
      input: "",
      messages: [
        {
          id: "assistant-1",
          role: "assistant" as const,
          parts: [
            { type: "text" as const, state: "streaming" as const, text: "One" },
          ],
        },
      ],
      onClose: noop,
      onInputChange: noop,
      onStop: noop,
      onSubmit: noop,
      presentation: "brunch" as const,
      status: "streaming" as const,
    };
    const view = render(<ChatView {...props} />);
    const transcript = screen.getByTestId("ai-transcript");
    Object.defineProperties(transcript, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1000 },
      scrollTop: { configurable: true, writable: true, value: 600 },
    });
    fireEvent.scroll(transcript);
    // 300px arrive while the smooth scroll is still moving towards the old end.
    Object.defineProperty(transcript, "scrollHeight", {
      configurable: true,
      value: 1300,
    });
    transcript.scrollTop = 650;
    fireEvent.scroll(transcript);
    scrollTo.mockClear();

    view.rerender(
      <ChatView
        {...props}
        messages={[
          {
            ...props.messages[0]!,
            parts: [{ type: "text", state: "streaming", text: "One two" }],
          },
        ]}
      />,
    );

    expect(scrollTo).toHaveBeenCalled();
    window.HTMLElement.prototype.scrollTo = originalScrollTo;
    window.requestAnimationFrame = originalRequestAnimationFrame;
  });

  test("renders a streaming ellipsis for empty streaming reasoning", async () => {
    const messages: PetrinautAiMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            state: "streaming",
            text: "",
          },
        ],
      },
    ];

    render(
      <ChatView
        primaryLabel="Chat"
        presentation="brunch"
        input=""
        messages={messages}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="streaming"
      />,
    );

    expect(screen.getByTestId("reasoning-loading")).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: /^Thinking/u })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /^Thinking/u }));
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: /^Thinking/u })
          .getAttribute("aria-expanded"),
      ).toBe("false"),
    );
    expect(screen.queryByText("Thinking...")).toBeNull();
  });

  test("hides completed reasoning when no text was received", () => {
    const messages: PetrinautAiMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            state: "done",
            text: "",
          },
        ],
      },
    ];

    render(
      <ChatView
        input=""
        messages={messages}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    expect(screen.queryByRole("button", { name: /^Thinking/u })).toBeNull();
  });

  test("renders assistant parts in message order", () => {
    const messages: PetrinautAiMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            state: "done",
            text: "Checking the current net.",
          },
          {
            type: "text",
            state: "done",
            text: "I found the current places.",
          },
        ],
      },
    ];

    const { container } = render(
      <ChatView
        input=""
        messages={messages}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    expect(container.textContent).toMatch(
      /Thinking[\s\S]*I found the current places\./u,
    );
  });

  test("right-aligns user text and renders active reasoning time", () => {
    const startedAt = Date.parse("2026-05-14T12:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(new Date(startedAt));

    const messages: PetrinautAiMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Add a place please" }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            state: "streaming",
            text: "Choosing the smallest valid place update.",
            providerMetadata: {
              petrinaut: { startedAt },
            },
          },
        ],
      },
    ];

    render(
      <ChatView
        input=""
        messages={messages}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="streaming"
      />,
    );

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(
      screen
        .getByText("Add a place please")
        .closest("[data-role]")
        ?.getAttribute("data-role"),
    ).toBe("user");
    expect(screen.getByLabelText("Reasoning time 2s")).not.toBeNull();

    vi.useRealTimers();
  });

  test("selects a target and expands a completed tool summary", async () => {
    const onSelectToolTarget = vi.fn();
    const messages: PetrinautAiMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "tool-addPlace",
            state: "output-available",
            toolCallId: "tool-1",
            input: {
              id: "place__buffer",
              name: "Buffer",
              colorId: null,
              dynamicsEnabled: false,
              differentialEquationId: null,
              x: 0,
              y: 0,
            },
            output: {
              applied: true,
              title: "Added place Buffer",
              detail: "Previous name: Queue",
              target: {
                kind: "selection",
                item: { type: "place", id: "place__buffer" },
              },
            },
          },
        ],
      },
    ];

    render(
      <ChatView
        input=""
        messages={messages}
        onClose={noop}
        onInputChange={noop}
        onSelectToolTarget={onSelectToolTarget}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    await expandWork();
    const toolButton = screen.getByRole("button", {
      name: /Added place Buffer/u,
    });

    fireEvent.click(toolButton);

    expect(screen.queryByTestId("tool-item-chevron")).toBeNull();
    expect(toolButton.getAttribute("data-tone")).toBe("success");
    expect(screen.getByTestId("tool-detail").textContent).toBe(
      "Previous name: Queue",
    );
    expect(onSelectToolTarget).toHaveBeenCalledWith({
      kind: "selection",
      item: { type: "place", id: "place__buffer" },
    });
  });

  test("renders individual tool rows with tones and no operations control", async () => {
    const messages: PetrinautAiMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "tool-addPlace",
            state: "output-available",
            toolCallId: "tool-1",
            input: {
              id: "place__buffer",
              name: "Buffer",
              colorId: null,
              dynamicsEnabled: false,
              differentialEquationId: null,
              x: 0,
              y: 0,
            },
            output: {
              applied: true,
              title: "Added place Buffer",
            },
          },
          {
            type: "tool-deleteItemsByIds",
            state: "input-available",
            toolCallId: "tool-2",
            input: {
              items: [{ type: "place", id: "place__old" }],
            },
          },
        ],
      },
    ];

    render(
      <ChatView
        input=""
        messages={messages}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="streaming"
      />,
    );

    await expandWork();
    expect(screen.queryByText(/operations/u)).toBeNull();
    expect(
      screen
        .getByRole("button", { name: /Added place Buffer/u })
        .getAttribute("data-tone"),
    ).toBe("success");
    expect(
      screen
        .getByRole("button", { name: /Deleted 1 item/u })
        .getAttribute("data-tone"),
    ).toBe("danger");
    expect(
      screen
        .getByRole("button", { name: /Deleted 1 item/u })
        .getAttribute("aria-busy"),
    ).toBe("true");
  });

  test("hides configured tool rows without removing their message parts", () => {
    const hiddenPart = {
      type: "dynamic-tool" as const,
      toolName: "layout_petrinaut_net",
      toolCallId: "hidden-layout",
      state: "input-available" as const,
      input: {},
    };
    const messages: PetrinautAiMessage[] = [
      {
        id: "assistant-hidden-tool",
        role: "assistant",
        parts: [
          hiddenPart,
          {
            type: "dynamic-tool",
            toolName: "read_petrinaut_diagnostics",
            toolCallId: "visible-diagnostics",
            state: "input-available",
            input: {},
          },
        ],
      },
    ];

    render(
      <ChatView
        hiddenToolNames={new Set(["layout_petrinaut_net"])}
        input=""
        messages={messages}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        resolveToolPresentation={({ toolName }) => ({
          title: `Rendered ${toolName}`,
        })}
        status="streaming"
      />,
    );

    expect(screen.queryByText("Rendered layout_petrinaut_net")).toBeNull();
    expect(
      screen.getByText("Rendered read_petrinaut_diagnostics"),
    ).not.toBeNull();
    expect(messages[0]?.parts[0]).toBe(hiddenPart);
  });

  test("keeps completed changes as individual rows", async () => {
    const messages: PetrinautAiMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "tool-addPlace",
            state: "output-available",
            toolCallId: "tool-1",
            input: {
              id: "place__buffer",
              name: "Buffer",
              colorId: null,
              dynamicsEnabled: false,
              differentialEquationId: null,
              x: 0,
              y: 0,
            },
            output: {
              applied: true,
              title: "Added place Buffer",
            },
          },
          {
            type: "tool-deleteItemsByIds",
            state: "output-available",
            toolCallId: "tool-2",
            input: {
              items: [{ type: "place", id: "place__old" }],
            },
            output: {
              applied: true,
              title: "Deleted 1 item",
            },
          },
        ],
      },
    ];

    render(
      <ChatView
        input=""
        messages={messages}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    await expandWork();
    expect(
      screen.getByRole("button", { name: /Added place Buffer/u }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /Deleted 1 item/u }),
    ).not.toBeNull();
    expect(screen.queryByText(/operations/u)).toBeNull();
  });

  test("keeps step-start internal while rendering chronological rows", async () => {
    const tool = (toolName: string, toolCallId: string) => ({
      type: "dynamic-tool" as const,
      toolName,
      toolCallId,
      state: "output-available" as const,
      input: {},
      output: { title: toolName },
    });
    const messages: PetrinautAiMessage[] = [
      {
        id: "assistant-steps",
        role: "assistant",
        parts: [
          tool("read_workpiece", "first-read"),
          tool("mutate_workpiece", "first-write"),
          { type: "step-start" },
          tool("read_petrinaut_net", "second-read"),
          tool("mutate_petrinaut_net", "second-write"),
        ],
      },
    ];

    render(
      <ChatView
        input=""
        messages={messages}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    await expandWork();
    const labels = within(screen.getByTestId("ai-transcript"))
      .getAllByRole("button")
      .filter((row) => row.hasAttribute("data-tone"))
      .filter((row) => !row.textContent.startsWith("Used"))
      .map((row) => row.textContent);
    expect(labels).toEqual([
      expect.stringContaining("read_workpiece"),
      expect.stringContaining("mutate_workpiece"),
      expect.stringContaining("read_petrinaut_net"),
      expect.stringContaining("mutate_petrinaut_net"),
    ]);
    expect(screen.queryByText(/operations/u)).toBeNull();
  });

  test("renders net definition checks and changes as individual rows", async () => {
    const messages: PetrinautAiMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "tool-getLatestNetDefinition",
            state: "output-available",
            toolCallId: "tool-net",
            input: {},
            output: {
              title: "HyProGen 121 - Stochastic Petri Net",
              extensions: DEFAULT_PETRINAUT_EXTENSIONS,
              definition: {
                places: [],
                transitions: [],
                types: [],
                differentialEquations: [],
                parameters: [],
              },
            },
          },
          {
            type: "tool-addPlace",
            state: "output-available",
            toolCallId: "tool-1",
            input: {
              id: "place__buffer",
              name: "Buffer",
              colorId: null,
              dynamicsEnabled: false,
              differentialEquationId: null,
              x: 0,
              y: 0,
            },
            output: {
              applied: true,
              title: "Added place Buffer",
            },
          },
          {
            type: "tool-deleteItemsByIds",
            state: "output-available",
            toolCallId: "tool-2",
            input: {
              items: [{ type: "place", id: "place__old" }],
            },
            output: {
              applied: true,
              title: "Deleted 1 item",
            },
          },
        ],
      },
    ];

    render(
      <ChatView
        input=""
        messages={messages}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    await expandWork();
    expect(
      screen.getByRole("button", { name: /Checked latest net definition/u }),
    ).not.toBeNull();
    expect(
      screen.queryByRole("button", {
        name: /HyProGen 121 - Stochastic Petri Net/u,
      }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /Added place Buffer/u }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /Deleted 1 item/u }),
    ).not.toBeNull();
    expect(screen.queryByText(/operations/u)).toBeNull();
  });

  test("shows failed tool-call errors inline", async () => {
    const messages: PetrinautAiMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "tool-deleteItemsByIds",
            state: "output-error",
            toolCallId: "tool-1",
            errorText: "Validation failed",
            input: {
              items: [{ type: "place", id: "place__old" }],
            },
          },
        ],
      },
    ];

    render(
      <ChatView
        input=""
        messages={messages}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="error"
      />,
    );

    await expandWork();
    const tool = screen.getByRole("button", {
      name: /Validation failed.*deleteItemsByIds/u,
    });
    expect(tool).not.toBeNull();
    expect(tool.getAttribute("title")).toBeNull();
  });

  test("expands deleted item summaries", async () => {
    const messages: PetrinautAiMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "tool-deleteItemsByIds",
            state: "output-available",
            toolCallId: "tool-1",
            input: {
              items: [
                { type: "place", id: "place__old" },
                { type: "transition", id: "transition__old" },
                { type: "parameter", id: "parameter__old" },
              ],
            },
            output: {
              applied: true,
              title: "Deleted 3 items",
              items: [
                "place: Old place",
                "transition: Old transition",
                "parameter: old_rate",
              ],
            },
          },
        ],
      },
    ];

    render(
      <ChatView
        input=""
        messages={messages}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    await expandWork();
    fireEvent.click(screen.getByRole("button", { name: /Deleted 3 items/u }));

    expect(screen.getByText("place: Old place")).not.toBeNull();
    expect(screen.getByText("transition: Old transition")).not.toBeNull();
    expect(screen.getByText("parameter: old_rate")).not.toBeNull();
  });
});

const toolRowPresentations = [
  {
    presentation: "stock",
    revealTools: () => Promise.resolve(),
    markers: {
      pending: "[data-tool-progress-spinner]",
      complete: '[data-tool-result-icon="complete"]',
      notApplied: '[data-tool-result-icon="not-applied"]',
      error: "svg",
    },
  },
  {
    presentation: "brunch",
    revealTools: expandWork,
    markers: {
      pending: '[data-tool-status="pending"]',
      complete: '[data-tool-status="ok"]',
      notApplied: '[data-tool-status="ok"]',
      error: '[data-tool-status="error"]',
    },
  },
] as const;

describe.each(toolRowPresentations)(
  "ChatView tool rows in the $presentation presentation",
  ({ presentation, revealTools, markers }) => {
    test.each([
      {
        label: "blocked",
        output: {
          applied: false,
          blocked: "readonly",
          reason: "Read-only document.",
        },
      },
      {
        label: "declined",
        output: { applied: false, reason: "User declined auto-layout." },
      },
      {
        label: "no-op",
        output: {
          applied: false,
          reason: "The mutation left the document unchanged.",
        },
      },
      {
        label: "stale host",
        output: {
          applied: false,
          reason:
            "The requested base does not match the independently observed document.",
        },
      },
      {
        label: "contradictory supplied summary",
        output: {
          applied: false,
          reason: "Not applied by the host.",
          title: "Updated arc weight",
          detail: "Requested value: 4",
        },
      },
    ])(
      "renders an explicit $label result as not applied, never requested-value success",
      async ({ output }) => {
        render(
          <ChatView
            input=""
            status="ready"
            onClose={noop}
            onInputChange={noop}
            onStop={noop}
            onSubmit={noop}
            presentation={presentation}
            messages={[
              {
                id: "assistant-unapplied",
                role: "assistant",
                parts: [
                  {
                    type: "dynamic-tool",
                    toolName: "updateArcWeight",
                    toolCallId: "unapplied",
                    state: "output-available",
                    input: {
                      transitionId: "transition",
                      placeId: "place",
                      arcDirection: "input",
                      weight: 4,
                    },
                    output,
                  },
                ],
              },
            ]}
          />,
        );
        await revealTools();
        const row = screen.getByRole("button", { name: /Not applied/u });
        expect(row.getAttribute("data-tone")).toBe("neutral");
        expect(within(row).getByText(output.reason)).not.toBeNull();
        expect(
          within(row).queryByText("Updated arc weight", { exact: true }),
        ).toBeNull();
        expect(row.querySelector(markers.notApplied)).not.toBeNull();
        expect(
          row.querySelector('[data-tool-result-icon="complete"]'),
        ).toBeNull();
      },
    );

    test("shows known noninteractive tool progress and replaces it with the terminal result", async () => {
      const createMessages = (
        state: "input-streaming" | "input-available" | "output-available",
      ) =>
        [
          {
            id: "assistant-1",
            role: "assistant",
            parts: [
              {
                type: "tool-addPlace",
                state,
                toolCallId: "tool-1",
                input: {
                  id: "place__buffer",
                  name: "Buffer",
                  colorId: null,
                  dynamicsEnabled: false,
                  differentialEquationId: null,
                  x: 0,
                  y: 0,
                },
                output:
                  state === "output-available"
                    ? { applied: true, title: "Added place Buffer" }
                    : undefined,
              },
            ],
          },
        ] as PetrinautAiMessage[];
      const props = {
        input: "",
        onClose: noop,
        onInputChange: noop,
        onStop: noop,
        onSubmit: noop,
        presentation,
        status: "streaming" as const,
      };
      const rendered = render(
        <ChatView {...props} messages={createMessages("input-streaming")} />,
      );

      await revealTools();
      expect(screen.getByText("Preparing…")).not.toBeNull();
      const pendingRow = screen.getByRole("button", { name: /Preparing/u });
      expect(within(pendingRow).queryByText(/Buffer/u)).toBeNull();
      expect(pendingRow.getAttribute("aria-busy")).toBe("true");
      expect(pendingRow.getAttribute("data-tone")).toBe("success");
      expect(pendingRow.querySelector(markers.pending)).not.toBeNull();

      rendered.rerender(
        <ChatView {...props} messages={createMessages("input-available")} />,
      );

      expect(screen.queryByText("Preparing…")).toBeNull();
      expect(screen.getByText("Running…")).not.toBeNull();

      rendered.rerender(
        <ChatView {...props} messages={createMessages("output-available")} />,
      );

      expect(screen.queryByText("Running…")).toBeNull();
      const completedRow = screen.getByRole("button", {
        name: /Added place Buffer/u,
      });
      expect(completedRow.hasAttribute("aria-busy")).toBe(false);
      expect(completedRow.querySelector(markers.complete)).not.toBeNull();
    });

    test("uses the host presentation resolver at every lifecycle site", async () => {
      const messages = [
        {
          id: "assistant-labels",
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName: "one",
              toolCallId: "one",
              state: "input-streaming",
            },
            {
              type: "dynamic-tool",
              toolName: "two",
              toolCallId: "two",
              state: "input-available",
              input: {},
            },
            {
              type: "dynamic-tool",
              toolName: "three",
              toolCallId: "three",
              state: "output-available",
              output: { title: "Stable result title" },
            },
            {
              type: "dynamic-tool",
              toolName: "four",
              toolCallId: "four",
              state: "output-error",
              errorText: "Host tool failed",
            },
            {
              type: "dynamic-tool",
              toolName: "unknown-tool",
              toolCallId: "unknown",
              state: "output-available",
              output: { title: "Unknown result title" },
            },
            {
              type: "dynamic-tool",
              toolName: "five",
              toolCallId: "not-applied",
              state: "output-available",
              output: { applied: false, reason: "Nothing changed" },
            },
            {
              type: "dynamic-tool",
              toolName: "six",
              toolCallId: "preserved-detail",
              state: "output-available",
              output: {
                title: "Default result title",
                detail: "Viewport frame: framed.",
              },
            },
          ],
        },
      ] as PetrinautAiMessage[];
      render(
        <ChatView
          input=""
          messages={messages}
          onClose={noop}
          onInputChange={noop}
          onStop={noop}
          onSubmit={noop}
          presentation={presentation}
          status="streaming"
          resolveToolPresentation={({ error, output, state, toolName }) => {
            if (toolName === "unknown-tool") return undefined;
            if (toolName === "five") {
              return {
                title: "Correctable five",
                tone: "neutral",
                items: ["Nothing changed"],
              };
            }
            if (toolName === "six") return { title: "Completed six" };
            const verb =
              state === "pending"
                ? toolName === "one"
                  ? "Preparing"
                  : "Running"
                : state === "success"
                  ? "Completed"
                  : "Could not complete";
            return {
              title: `${verb} ${toolName}`,
              detail:
                error ??
                (typeof output === "object" &&
                output !== null &&
                "title" in output &&
                typeof output.title === "string"
                  ? output.title
                  : undefined),
            };
          }}
        />,
      );

      await revealTools();
      const preparingOne = screen.getByText("Preparing one").closest("button");
      const runningTwo = screen.getByText("Running two").closest("button");
      expect(preparingOne?.getAttribute("aria-busy")).toBe("true");
      expect(runningTwo?.getAttribute("aria-busy")).toBe("true");
      expect(screen.queryByText(/operations/u)).toBeNull();
      expect(screen.getByText("Completed three")).not.toBeNull();
      expect(screen.getByText("Could not complete four")).not.toBeNull();
      expect(
        within(
          screen.getByText("Completed three").closest("button")!,
        ).getByTestId("tool-detail").textContent,
      ).toBe("Stable result title");
      expect(
        within(
          screen.getByText("Could not complete four").closest("button")!,
        ).getByTestId("tool-detail").textContent,
      ).toBe("Host tool failed");
      expect(screen.getByText("Unknown result title")).not.toBeNull();
      expect(screen.getByText("Correctable five")).not.toBeNull();
      expect(screen.queryByText("Not applied")).toBeNull();
      expect(screen.queryByText("Completed five")).toBeNull();
      expect(
        screen
          .getByRole("button", { name: /Correctable five/u })
          .getAttribute("data-tone"),
      ).toBe("neutral");
      expect(
        screen
          .getByRole("button", { name: /Correctable five/u })
          .querySelector(markers.notApplied),
      ).not.toBeNull();
      fireEvent.click(
        screen.getByRole("button", { name: /Correctable five/u }),
      );
      expect(screen.getByText("Nothing changed")).not.toBeNull();
      expect(
        within(
          screen.getByText("Completed six").closest("button")!,
        ).getByTestId("tool-detail").textContent,
      ).toBe("Viewport frame: framed.");
    });

    test("renders host pending, applied, refused and thrown tool cues", async () => {
      const resolveToolPresentation = ({
        output,
        state,
        toolName,
      }: {
        output: unknown;
        state: "error" | "pending" | "success";
        toolName: string;
      }) => {
        if (toolName !== "mutate_workpiece") return undefined;
        if (
          typeof output === "object" &&
          output !== null &&
          "disposition" in output &&
          output.disposition === "refused" &&
          "message" in output &&
          typeof output.message === "string"
        ) {
          return {
            title: "Ledger update needs correction",
            tone: "neutral" as const,
            items: [output.message],
          };
        }
        return {
          title:
            state === "pending"
              ? "Updating ledger"
              : state === "success"
                ? "Updated ledger"
                : "Could not update ledger",
          tone:
            state === "pending"
              ? ("pending" as const)
              : state === "error"
                ? ("danger" as const)
                : ("success" as const),
        };
      };
      const renderTools = (messages: PetrinautAiMessage[]) =>
        render(
          <ChatView
            input=""
            messages={messages}
            onClose={noop}
            onInputChange={noop}
            onStop={noop}
            onSubmit={noop}
            presentation={presentation}
            resolveToolPresentation={resolveToolPresentation}
            status="streaming"
          />,
        );

      const pending = renderTools([
        {
          id: "assistant-pending",
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName: "mutate_workpiece",
              toolCallId: "pending-call",
              state: "input-streaming",
              input: {},
            },
          ],
        },
      ]);
      await revealTools();
      const pendingRow = screen.getByRole("button", {
        name: /Updating ledger/u,
      });
      expect(pendingRow.getAttribute("data-tone")).toBe("pending");
      expect(pendingRow.querySelector(markers.pending)).not.toBeNull();
      pending.unmount();

      const applied = renderTools([
        {
          id: "assistant-applied",
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName: "mutate_workpiece",
              toolCallId: "applied-call",
              state: "output-available",
              input: {},
              output: {
                disposition: "applied",
                applied: true,
                revisionId: "applied-call",
                sha256: "b".repeat(64),
                ordinal: 1,
              },
            },
          ],
        },
      ]);
      await revealTools();
      const appliedRow = screen.getByRole("button", {
        name: /Updated ledger/u,
      });
      expect(appliedRow.getAttribute("data-tone")).toBe("success");
      expect(appliedRow.querySelector(markers.complete)).not.toBeNull();
      applied.unmount();

      const refused = renderTools([
        {
          id: "assistant-refused",
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName: "mutate_workpiece",
              toolCallId: "refused-call",
              state: "output-available",
              input: {},
              output: {
                disposition: "refused",
                applied: false,
                correctable: true,
                code: "silent-shrink",
                message:
                  "Nothing was written; resubmit the complete settled account.",
                currentRevision: null,
              },
            },
          ],
        },
      ]);
      await revealTools();
      const refusedRow = screen.getByRole("button", {
        name: /Ledger update needs correction/u,
      });
      expect(refusedRow.getAttribute("data-tone")).toBe("neutral");
      expect(refusedRow.querySelector(markers.notApplied)).not.toBeNull();
      expect(within(refusedRow).queryByTestId("tool-detail")).toBeNull();
      fireEvent.click(refusedRow);
      expect(
        screen.getByText(
          "Nothing was written; resubmit the complete settled account.",
        ),
      ).not.toBeNull();
      refused.unmount();

      renderTools([
        {
          id: "assistant-thrown",
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName: "mutate_workpiece",
              toolCallId: "thrown-call",
              state: "output-error",
              input: {},
              errorText: "Current state missing",
            },
          ],
        },
      ]);
      await revealTools();
      const thrownRow = screen.getByRole("button", {
        name: /Could not update ledger/u,
      });
      expect(thrownRow.getAttribute("data-tone")).toBe("danger");
      expect(thrownRow.querySelector(markers.error)).not.toBeNull();
    });
  },
);

describe("ChatView in the stock presentation", () => {
  test.each([
    { status: "streaming" as const, live: true },
    { status: "error" as const, live: false },
  ])(
    "keeps reasoning live only while its reply streams ($status)",
    ({ status, live }) => {
      render(
        <ChatView
          input=""
          messages={[
            {
              id: "assistant-1",
              role: "assistant",
              parts: [
                {
                  type: "reasoning",
                  state: "streaming",
                  text: "**Planning the net**\n\nUnderstanding the request.",
                },
              ],
            },
          ]}
          error={status === "error" ? new Error("Network failed") : undefined}
          onClose={noop}
          onInputChange={noop}
          onStop={noop}
          onSubmit={noop}
          status={status}
        />,
      );

      expect(
        screen
          .getByRole("button", { name: /Thinking/u })
          .getAttribute("aria-expanded"),
      ).toBe(String(live));
    },
  );

  test("renders streamed markdown and collapsed reasoning", () => {
    const startedAt = Date.parse("2026-05-14T12:00:00Z");
    const finishedAt = startedAt + 4_500;
    const messages: PetrinautAiMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            state: "done",
            text: "**Planning the net**\n\nUnderstanding the requested model.",
            providerMetadata: {
              petrinaut: { startedAt, finishedAt },
            },
          },
          {
            type: "text",
            state: "done",
            text: "**Created** a supply chain model.",
          },
        ],
      },
    ];

    render(
      <ChatView
        input=""
        messages={messages}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    expect(screen.getByText("Created")).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: /Thinking: Planning the net/u })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.getByText("Thinking: Planning the net")).not.toBeNull();
    expect(screen.queryByTestId("reasoning-status")).toBeNull();
    expect(screen.getByLabelText(/Reasoning time/u)).not.toBeNull();
  });

  test("selects a target from a completed tool summary without a single-item chevron", () => {
    const onSelectToolTarget = vi.fn();
    const messages: PetrinautAiMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "tool-addPlace",
            state: "output-available",
            toolCallId: "tool-1",
            input: {
              id: "place__buffer",
              name: "Buffer",
              colorId: null,
              dynamicsEnabled: false,
              differentialEquationId: null,
              x: 0,
              y: 0,
            },
            output: {
              applied: true,
              title: "Added place Buffer",
              detail: "Previous name: Queue",
              target: {
                kind: "selection",
                item: { type: "place", id: "place__buffer" },
              },
            },
          },
        ],
      },
    ];

    render(
      <ChatView
        input=""
        messages={messages}
        onClose={noop}
        onInputChange={noop}
        onSelectToolTarget={onSelectToolTarget}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    const toolButton = screen.getByRole("button", {
      name: /Added place Buffer/u,
    });

    fireEvent.click(toolButton);

    expect(screen.queryByTestId("tool-item-chevron")).toBeNull();
    expect(toolButton.getAttribute("data-tone")).toBe("success");
    expect(screen.getByTestId("tool-detail").textContent).toBe(
      "Previous name: Queue",
    );
    expect(onSelectToolTarget).toHaveBeenCalledWith({
      kind: "selection",
      item: { type: "place", id: "place__buffer" },
    });
  });

  test("prioritizes Stop and retains disabled Send without Voice mode", () => {
    const onStop = vi.fn();
    const props = {
      input: "Draft",
      messages: [] as PetrinautAiMessage[],
      onClose: noop,
      onInputChange: noop,
      onStop,
      onSubmit: vi.fn(),
      status: "streaming" as const,
      voiceModeAvailable: true,
    };
    const rendered = render(<ChatView {...props} />);

    expect(
      screen.queryByRole("button", { name: "Start voice mode" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Send message" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stop AI response" }));
    expect(onStop).toHaveBeenCalledOnce();

    rendered.rerender(
      <ChatView
        {...props}
        input=""
        status="ready"
        voiceModeAvailable={false}
      />,
    );

    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Send message",
      }).disabled,
    ).toBe(true);
  });

  test("switches the trailing action from Voice mode to Send for trimmed input", () => {
    const onInputModeChange = vi.fn();
    const onSubmit = vi.fn();
    const props = {
      messages: [] as PetrinautAiMessage[],
      onClose: noop,
      onInputChange: noop,
      onInputModeChange,
      onStop: noop,
      onSubmit,
      status: "ready" as const,
      voiceModeAvailable: true,
    };
    const rendered = render(<ChatView {...props} input="" />);

    const voiceButton = screen.getByRole("button", {
      name: "Start voice mode",
    });
    expect(voiceButton.querySelector("svg")).not.toBeNull();
    expect(voiceButton.parentElement?.getAttribute("data-scope")).toBe(
      "tooltip",
    );
    fireEvent.click(voiceButton);

    expect(onInputModeChange).toHaveBeenCalledOnce();
    expect(onInputModeChange).toHaveBeenCalledWith("voice");
    expect(onSubmit).not.toHaveBeenCalled();

    rendered.rerender(<ChatView {...props} input="   " />);
    expect(
      screen.getByRole("button", { name: "Start voice mode" }),
    ).not.toBeNull();

    rendered.rerender(<ChatView {...props} input="  Create a queue  " />);
    expect(
      screen.queryByRole("button", { name: "Start voice mode" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
