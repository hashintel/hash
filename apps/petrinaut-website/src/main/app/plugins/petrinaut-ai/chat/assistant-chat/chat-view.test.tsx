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
  type ComponentProps,
  createElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "@hashintel/petrinaut-core";
import { AssistantPanelPreview } from "@hashintel/petrinaut/ui/plugin";

import {
  createEmptyTestInstance,
  createTestPluginApi,
} from "../../testing/create-test-plugin-api";
import { AssistantChatApiContext } from "./chat-api";
import { ChatView } from "./chat-view";

import type { PetrinautAiMessage } from "../ai-message";

const renderMarkdown = vi.hoisted(() => vi.fn());

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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

/** The chat view in the assistant panel, as the chat drives it. */
const PanelChatView = (props: ComponentProps<typeof ChatView>) => (
  <AssistantPanelPreview state={{ isOpen: props.isOpen ?? true }}>
    <ChatView {...props} />
  </AssistantPanelPreview>
);

describe("ChatView", () => {
  test("marks unfinished tools cancelled after a stop", () => {
    render(
      <ChatView
        input=""
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
        stopped
        messages={[
          {
            id: "stopped-tools",
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
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
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

  test.each(["output-available", "output-error"] as const)(
    "preserves %s applied/error presentation",
    (state) => {
      render(
        <ChatView
          input=""
          status="ready"
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

  test("labels stopped history after a later completed reply without global Stop state", () => {
    render(
      <ChatView
        input=""
        status="ready"
        stopped={false}
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
    expect(screen.getAllByText("Response stopped")).toHaveLength(1);
  });

  test("keeps assistant errors in global notifications", () => {
    const message =
      'Elicitor failed.\nCaused by: {"field":"answer","reason":"Required"}';
    render(
      <ChatView
        error={new Error(message)}
        input=""
        messages={[]}
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
      within(screen.getByTestId("ai-transcript")).queryByText(message),
    ).toBeNull();
  });

  test("keeps completed messages memoized while the draft changes", () => {
    const messages: PetrinautAiMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", state: "done", text: "Completed response" }],
      },
    ];
    const props = {
      messages,
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

  test("renders an interactive tool and submits its output once", () => {
    const onInteractiveToolSubmit = vi.fn();
    const awaitingMessages = [
      {
        id: "assistant-layout",
        role: "assistant",
        parts: [
          {
            type: "tool-applyAutoLayout",
            state: "input-available",
            toolCallId: "layout-call-1",
            input: { askUserFirst: true },
          },
        ],
      },
    ] as unknown as PetrinautAiMessage[];

    const { rerender } = render(
      <ChatView
        input=""
        messages={awaitingMessages}
        onInputChange={noop}
        onInteractiveToolSubmit={onInteractiveToolSubmit}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    expect(screen.getByText(/suggests running auto-layout/u)).not.toBeNull();

    const approveButton = screen.getByRole("button", {
      name: "Yes, auto-layout",
    });
    fireEvent.click(approveButton);
    fireEvent.click(approveButton);

    expect(onInteractiveToolSubmit).toHaveBeenCalledOnce();
    expect(onInteractiveToolSubmit).toHaveBeenCalledWith({
      toolCallId: "layout-call-1",
      toolName: "applyAutoLayout",
      output: { applied: true, title: "Auto-layout requested" },
    });

    const submittedMessages = [
      {
        ...awaitingMessages[0],
        parts: [
          {
            ...awaitingMessages[0]!.parts[0],
            state: "output-available",
            output: { applied: true, title: "Auto-layout requested" },
          },
        ],
      },
    ] as unknown as PetrinautAiMessage[];

    rerender(
      <ChatView
        input=""
        messages={submittedMessages}
        onInputChange={noop}
        onInteractiveToolSubmit={onInteractiveToolSubmit}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Yes, auto-layout" }),
    ).toBeNull();
    expect(screen.getByText("Auto-layout requested")).not.toBeNull();
  });

  test("waits for complete tool input before rendering its widget", () => {
    const createMessages = (state: "input-streaming" | "input-available") =>
      [
        {
          id: "assistant-layout",
          role: "assistant",
          parts: [
            {
              type: "tool-applyAutoLayout",
              state,
              toolCallId: "layout-call-1",
              input: { askUserFirst: true },
            },
          ],
        },
      ] as unknown as PetrinautAiMessage[];

    const { rerender } = render(
      <ChatView
        input=""
        messages={createMessages("input-streaming")}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="streaming"
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Yes, auto-layout" }),
    ).toBeNull();

    rerender(
      <ChatView
        input=""
        messages={createMessages("input-available")}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Yes, auto-layout" }),
    ).not.toBeNull();
    expect(screen.queryByText("Running…")).toBeNull();
  });

  test("allows retry when an interactive tool output is rejected", async () => {
    const onInteractiveToolSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error("Output was not accepted"))
      .mockResolvedValueOnce(undefined);
    const messages = [
      {
        id: "assistant-layout",
        role: "assistant",
        parts: [
          {
            type: "tool-applyAutoLayout",
            state: "input-available",
            toolCallId: "layout-call-1",
            input: { askUserFirst: true },
          },
        ],
      },
    ] as unknown as PetrinautAiMessage[];

    render(
      <ChatView
        input=""
        messages={messages}
        onInputChange={noop}
        onInteractiveToolSubmit={onInteractiveToolSubmit}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    const approveButton = screen.getByRole("button", {
      name: "Yes, auto-layout",
    });
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
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    expect(screen.getByText(/Ask AI to create a Petri net/u)).not.toBeNull();
  });

  test("keeps prompt chips on one scrolling row", () => {
    const { container } = render(
      <ChatView
        input=""
        messages={[
          {
            id: "assistant-1",
            role: "assistant",
            parts: [{ type: "text", text: "An answer" }],
          },
        ]}
        onInputChange={noop}
        onSendPrompt={noop}
        onStop={noop}
        onSubmit={noop}
        promptChips={[{ id: "review", label: "Review", prompt: "Review" }]}
        status="ready"
      />,
    );

    expect(container.querySelector("[data-prompt-chips]")?.className).toContain(
      "ov-x_auto",
    );
  });

  test("sets the user message on a subtle background", () => {
    const { container } = render(
      <ChatView
        input=""
        messages={[
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "A prompt" }],
          },
          {
            id: "assistant-1",
            role: "assistant",
            parts: [{ type: "text", text: "An answer" }],
          },
        ]}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    expect(container.querySelector('[data-role="user"]')?.className).toContain(
      "bg-c_neutral.bg.subtle",
    );
  });

  test("titles the panel AI", () => {
    render(
      <PanelChatView
        input=""
        messages={[]}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );
    expect(screen.getByText("AI")).not.toBeNull();
  });

  test("calls the clear handler from the header", () => {
    const onClearMessages = vi.fn();

    render(
      <PanelChatView
        input=""
        messages={[
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "Start over" }],
          },
        ]}
        onClearMessages={onClearMessages}
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

  test("follows new content after the reader scrolls away from the end", () => {
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
      onInputChange: noop,
      onStop: noop,
      onSubmit: noop,
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
        input=""
        messages={messages}
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

  test("renders individual tool rows with tones and no operations control", () => {
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
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="streaming"
      />,
    );

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

  test("keeps completed changes as individual rows", () => {
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
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    expect(
      screen.getByRole("button", { name: /Added place Buffer/u }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /Deleted 1 item/u }),
    ).not.toBeNull();
    expect(screen.queryByText(/operations/u)).toBeNull();
  });

  test("keeps step-start internal while rendering chronological rows", () => {
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
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    const labels = within(screen.getByTestId("ai-transcript"))
      .getAllByRole("button")
      .filter((row) => row.hasAttribute("data-tone"))
      .map((row) => row.textContent);
    expect(labels).toEqual([
      expect.stringContaining("read_workpiece"),
      expect.stringContaining("mutate_workpiece"),
      expect.stringContaining("read_petrinaut_net"),
      expect.stringContaining("mutate_petrinaut_net"),
    ]);
    expect(screen.queryByText(/operations/u)).toBeNull();
  });

  test("renders net definition checks and changes as individual rows", () => {
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
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

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

  test("shows failed tool-call errors inline", () => {
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
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="error"
      />,
    );

    const tool = screen.getByRole("button", {
      name: /Validation failed.*deleteItemsByIds/u,
    });
    expect(tool).not.toBeNull();
    expect(tool.getAttribute("title")).toBeNull();
  });

  test("expands deleted item summaries", () => {
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
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Deleted 3 items/u }));

    expect(screen.getByText("place: Old place")).not.toBeNull();
    expect(screen.getByText("transition: Old transition")).not.toBeNull();
    expect(screen.getByText("parameter: old_rate")).not.toBeNull();
  });

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

  test("prioritizes Stop and retains disabled Send", () => {
    const onStop = vi.fn();
    const props = {
      input: "Draft",
      messages: [] as PetrinautAiMessage[],
      onInputChange: noop,
      onStop,
      onSubmit: vi.fn(),
      status: "streaming" as const,
    };
    const rendered = render(<ChatView {...props} />);

    expect(screen.queryByRole("button", { name: "Send message" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stop AI response" }));
    expect(onStop).toHaveBeenCalledOnce();

    rendered.rerender(<ChatView {...props} input="" status="ready" />);

    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Send message",
      }).disabled,
    ).toBe(true);
  });

  test("enables Send only for trimmed input", () => {
    const onSubmit = vi.fn();
    const props = {
      messages: [] as PetrinautAiMessage[],
      onInputChange: noop,
      onStop: noop,
      onSubmit,
      status: "ready" as const,
    };
    const rendered = render(<ChatView {...props} input="   " />);

    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Send message" })
        .disabled,
    ).toBe(true);

    rendered.rerender(<ChatView {...props} input="  Create a queue  " />);
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSubmit).toHaveBeenCalledOnce();
  });
});

describe("ChatView tool rows", () => {
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
    ({ output }) => {
      render(
        <ChatView
          input=""
          status="ready"
          onInputChange={noop}
          onStop={noop}
          onSubmit={noop}
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
      const row = screen.getByRole("button", { name: /Not applied/u });
      expect(row.getAttribute("data-tone")).toBe("neutral");
      expect(within(row).getByText(output.reason)).not.toBeNull();
      expect(
        within(row).queryByText("Updated arc weight", { exact: true }),
      ).toBeNull();
      expect(
        row.querySelector('[data-tool-result-icon="not-applied"]'),
      ).not.toBeNull();
      expect(
        row.querySelector('[data-tool-result-icon="complete"]'),
      ).toBeNull();
    },
  );

  test("shows known noninteractive tool progress and replaces it with the terminal result", () => {
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
      onInputChange: noop,
      onStop: noop,
      onSubmit: noop,
      status: "streaming" as const,
    };
    const rendered = render(
      <ChatView {...props} messages={createMessages("input-streaming")} />,
    );

    expect(screen.getByText("Preparing…")).not.toBeNull();
    const pendingRow = screen.getByRole("button", { name: /Preparing/u });
    expect(within(pendingRow).queryByText(/Buffer/u)).toBeNull();
    expect(pendingRow.getAttribute("aria-busy")).toBe("true");
    expect(pendingRow.getAttribute("data-tone")).toBe("success");
    expect(
      pendingRow.querySelector("[data-tool-progress-spinner]"),
    ).not.toBeNull();

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
    expect(
      completedRow.querySelector('[data-tool-result-icon="complete"]'),
    ).not.toBeNull();
  });
});
