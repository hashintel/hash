/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { createElement, useEffect, useState } from "react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "@hashintel/petrinaut-core";

import {
  NotificationsContext,
  type NotificationsContextValue,
} from "../../../../../react/notifications/context";
import { NotificationsProvider } from "../../../../../react/notifications/provider";
import { VoiceSessionContext } from "../../../../../react/voice-session/context";
import { createVoiceSessionStore } from "../../../../../react/voice-session/store";
import { definePetrinautAiInteractiveTool } from "../../../../types/ai-interactive-tool";
import { AiAssistantContents } from "./ai-assistant-contents";

import type { PetrinautAiMessage } from "./types";

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

describe("AiAssistantContents", () => {
  test("shows assistant errors as toasts instead of transcript messages", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <NotificationsProvider>
        <AiAssistantContents
          error={
            new Error(
              'Elicitor failed.\nCaused by: {"field":"answer","reason":"Required"}',
            )
          }
          input=""
          messages={[]}
          onClose={noop}
          onInputChange={noop}
          onStop={noop}
          onSubmit={noop}
          status="error"
        />
      </NotificationsProvider>,
    );

    const toast = await waitFor(() => {
      const element = document.querySelector<HTMLElement>(
        '[data-scope="toast"][data-part="root"]',
      );
      expect(element).not.toBeNull();
      return element!;
    });
    expect(
      toast.querySelector('[data-scope="toast"][data-part="title"]')
        ?.textContent,
    ).toBe("AI assistant error");
    expect(
      toast.querySelector('[data-scope="toast"][data-part="description"]')
        ?.textContent,
    ).toBe(
      'Elicitor failed.\nCaused by: {"field":"answer","reason":"Required"}',
    );
    fireEvent.click(
      within(toast).getByRole("button", { name: "Copy details" }),
    );
    expect(writeText).toHaveBeenCalledWith(
      'Elicitor failed.\nCaused by: {"field":"answer","reason":"Required"}',
    );
    expect(
      within(screen.getByTestId("ai-transcript")).queryByText(
        "AI assistant error",
      ),
    ).toBeNull();
    fireEvent.click(
      within(toast).getByRole("button", { name: "Close notification" }),
    );
    await waitFor(() =>
      expect(toast.getAttribute("data-state")).toBe("closed"),
    );
  });

  test("keeps one Voice mode slot mounted above the composer when the panel closes", () => {
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
    const { rerender } = render(
      <AiAssistantContents {...props} isOpen={true} />,
    );

    expect(screen.getByText("Voice mode")).not.toBeNull();
    // The host slot sits outside the scrolling transcript so consent and
    // start-up chrome stay pinned above the composer.
    const voiceSlot = screen.getByTestId("ai-voice-mode");
    const transcript = screen.getByTestId("ai-transcript");
    expect(transcript.contains(voiceSlot)).toBe(false);
    const panelRows = [...voiceSlot.parentElement!.children];
    expect(panelRows.indexOf(voiceSlot)).toBeGreaterThan(
      panelRows.indexOf(transcript),
    );
    rerender(<AiAssistantContents {...props} isOpen={false} />);

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
          <AiAssistantContents
            input=""
            inputMode={inputMode}
            messages={messages}
            onClose={noop}
            onInputChange={noop}
            onStop={noop}
            onSubmit={noop}
            onVoiceDockCollapsedChange={setCollapsed}
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
        .getByRole("button", { name: "Collapse voice session" })
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
      within(dock).getByRole("button", { name: "Collapse voice session" }),
    );

    expect(screen.getByTestId("ai-transcript")).toBe(transcript);
    expect(screen.getByTestId("ai-voice-mode")).toBe(voiceMode);
    expect(
      screen
        .getByRole("button", { name: "Close AI assistant", hidden: true })
        .closest("div"),
    ).toBe(header);
    expect(transcript.className).toContain("d_none");
    expect(voiceMode.className).toContain("d_none");
    expect(header.className).toContain("d_none");

    fireEvent.click(
      within(dock).getByRole("button", { name: "Expand voice session" }),
    );

    expect(transcript.className).not.toContain("d_none");
    expect(voiceMode.className).not.toContain("d_none");
    expect(header.className).not.toContain("d_none");
    expect(screen.getByText("Spoken request")).not.toBeNull();

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
      <AiAssistantContents
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
    expect(permission.parentElement?.nextElementSibling).toBe(
      setupDock.parentElement,
    );
    expect(screen.getByTestId("ai-transcript").className).toContain("d_none");
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

  test("keeps handoff and canonical playback controls in the Voice dock", async () => {
    const store = createVoiceSessionStore();
    const actions = {
      end: vi.fn(),
      pause: vi.fn(),
      readFullResponse: vi.fn(),
      reconnect: vi.fn(),
      repeatQuestion: vi.fn(),
      resume: vi.fn(),
      setMicrophoneMuted: vi.fn(),
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
    });
    render(
      <VoiceSessionContext.Provider value={store}>
        <AiAssistantContents
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

    const dock = screen.getByRole("region", { name: "Voice session" });
    expect(within(dock).getByText("Speaking")).not.toBeNull();

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
      within(dock).getByRole("button", { name: "Voice playback options" }),
    );
    const repeatQuestion = await screen.findByRole("menuitem", {
      name: "Repeat question",
    });
    const repeatMenu = screen.getByRole("menu");
    fireEvent.keyDown(repeatMenu, { key: "ArrowDown" });
    await waitFor(() =>
      expect(repeatMenu.getAttribute("aria-activedescendant")).toBe(
        repeatQuestion.id,
      ),
    );
    fireEvent.keyDown(repeatMenu, { key: "Enter" });
    await waitFor(() => expect(actions.repeatQuestion).toHaveBeenCalledOnce());

    fireEvent.click(
      within(dock).getByRole("button", { name: "Voice playback options" }),
    );
    const readFullResponse = await screen.findByRole("menuitem", {
      name: "Read full response",
    });
    const fullResponseMenu = screen.getByRole("menu");
    fireEvent.keyDown(fullResponseMenu, { key: "End" });
    await waitFor(() =>
      expect(fullResponseMenu.getAttribute("aria-activedescendant")).toBe(
        readFullResponse.id,
      ),
    );
    fireEvent.keyDown(fullResponseMenu, { key: "Enter" });
    await waitFor(() =>
      expect(actions.readFullResponse).toHaveBeenCalledOnce(),
    );

    act(() => {
      store.setState({
        errorMessage: null,
        microphoneLevel: 0,
        microphoneMuted: true,
        phase: "speaking",
      });
    });

    expect(within(dock).getByText("Speaking")).not.toBeNull();
    fireEvent.click(
      within(dock).getByRole("button", { name: "Unmute microphone" }),
    );

    expect(actions.setMicrophoneMuted).toHaveBeenLastCalledWith(false);

    act(() => {
      store.setState({
        errorMessage: null,
        microphoneLevel: 0,
        microphoneMuted: false,
        notice: "We didn't catch that. Please try again.",
        phase: "listening",
      });
    });
    expect(
      within(dock).getAllByText("We didn't catch that. Please try again."),
    ).not.toHaveLength(0);
    expect(dock.getAttribute("data-voice-notice")).toBe("visible");
  });

  test("shows a voice recovery failure as a toast", async () => {
    const store = createVoiceSessionStore();
    store.setState({
      errorMessage: "Microphone unavailable. Check your browser permissions.",
      microphoneLevel: 0,
      microphoneMuted: false,
      phase: "error",
    });
    render(
      <NotificationsProvider>
        <VoiceSessionContext.Provider value={store}>
          <AiAssistantContents
            input=""
            messages={[]}
            onClose={noop}
            onInputChange={noop}
            onStop={noop}
            onSubmit={noop}
            status="ready"
          />
        </VoiceSessionContext.Provider>
      </NotificationsProvider>,
    );

    const toast = await waitFor(() => {
      const element = document.querySelector<HTMLElement>(
        '[data-scope="toast"][data-part="root"]',
      );
      expect(element).not.toBeNull();
      return element!;
    });
    expect(
      toast.querySelector('[data-scope="toast"][data-part="title"]')
        ?.textContent,
    ).toBe("Microphone unavailable. Check your browser permissions.");
  });

  test("does not repeat a voice error toast until the session recovers", () => {
    const store = createVoiceSessionStore();
    const errorState = {
      errorMessage: "Microphone unavailable. Check your browser permissions.",
      microphoneLevel: 0,
      microphoneMuted: false,
      phase: "error" as const,
    };
    store.setState(errorState);
    const dismissNotification = vi.fn();
    const firstAddNotification = vi.fn(() => "first-notification");
    const secondAddNotification = vi.fn(() => "second-notification");
    const renderWithNotifier = (
      addNotification: NotificationsContextValue["addNotification"],
    ) => (
      <NotificationsContext value={{ addNotification, dismissNotification }}>
        <VoiceSessionContext.Provider value={store}>
          <AiAssistantContents
            input=""
            messages={[]}
            onClose={noop}
            onInputChange={noop}
            onStop={noop}
            onSubmit={noop}
            status="ready"
          />
        </VoiceSessionContext.Provider>
      </NotificationsContext>
    );
    const { rerender } = render(renderWithNotifier(firstAddNotification));

    expect(firstAddNotification).toHaveBeenCalledOnce();
    rerender(renderWithNotifier(secondAddNotification));
    expect(secondAddNotification).not.toHaveBeenCalled();

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
    expect(secondAddNotification).toHaveBeenCalledOnce();
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
      <AiAssistantContents
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
      <AiAssistantContents
        input=""
        isOpen={false}
        messages={[]}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    expect(
      container
        .querySelector('aside[aria-label="AI assistant"]')
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  test("keeps keyboard drafting available and protects clear-chat during active Voice mode", () => {
    render(
      <AiAssistantContents
        clearMessagesDisabled={true}
        input="Draft answer"
        inputMode="voice"
        isOpen={true}
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
      <AiAssistantContents
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

  test("marks only persisted ordinary voice messages with waveform provenance", () => {
    render(
      <AiAssistantContents
        input=""
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
        ]}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    expect(
      within(
        screen.getByText("Spoken workflow").closest("[data-role]")!,
      ).getByTestId("voice-input-provenance"),
    ).not.toBeNull();
    expect(
      within(
        screen.getByText("Typed follow-up").closest("[data-role]")!,
      ).queryByTestId("voice-input-provenance"),
    ).toBeNull();
  });

  test("marks every submitted interactive-tool answer named by voice metadata", () => {
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
      <AiAssistantContents
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

    for (const [toolCallId, answer] of [
      ["question-voice-1", "The shift lead"],
      ["question-voice-2", "The dispatcher"],
    ]) {
      expect(
        within(
          screen
            .getByText(`${toolCallId}: ${answer}`)
            .closest("[data-tool-call-id]")!,
        ).getByTestId("voice-input-provenance"),
      ).not.toBeNull();
    }
    expect(
      within(
        screen
          .getByText("question-typed: The operator")
          .closest("[data-tool-call-id]")!,
      ).queryByTestId("voice-input-provenance"),
    ).toBeNull();
    expect(screen.getAllByTestId("voice-input-provenance")).toHaveLength(2);
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

    const { rerender } = render(<AiAssistantContents {...props} input="" />);

    expect(renderMarkdown).toHaveBeenCalledOnce();

    rerender(<AiAssistantContents {...props} input="Next message" />);

    expect(renderMarkdown).toHaveBeenCalledOnce();
  });

  test("renders a host composer control between the textarea and send button", () => {
    render(
      <AiAssistantContents
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

    expect(textarea.nextElementSibling).toBe(control);
    expect(control.nextElementSibling?.contains(sendButton)).toBe(true);
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
    const rendered = render(<AiAssistantContents {...props} input="" />);

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

    rendered.rerender(<AiAssistantContents {...props} input="   " />);
    expect(
      screen.getByRole("button", { name: "Start voice mode" }),
    ).not.toBeNull();

    rendered.rerender(
      <AiAssistantContents {...props} input="  Create a queue  " />,
    );
    expect(
      screen.queryByRole("button", { name: "Start voice mode" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSubmit).toHaveBeenCalledOnce();
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
    const rendered = render(<AiAssistantContents {...props} />);

    expect(
      screen.queryByRole("button", { name: "Start voice mode" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Send message" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stop AI response" }));
    expect(onStop).toHaveBeenCalledOnce();

    rendered.rerender(
      <AiAssistantContents
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

  test("does not submit the draft when a host composer button omits its type", () => {
    const onSubmit = vi.fn();
    render(
      <AiAssistantContents
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
      <AiAssistantContents
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
      <AiAssistantContents
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
      <AiAssistantContents
        input=""
        interactiveTools={[hostTool]}
        messages={createMessages("input-streaming", {})}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="streaming"
      />,
    );

    expect(parseInput).not.toHaveBeenCalled();
    expect(screen.queryByText("Ship this change?")).toBeNull();

    rerender(
      <AiAssistantContents
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
      <AiAssistantContents
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
      <AiAssistantContents
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
            text: "Understanding the requested model.",
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
      <AiAssistantContents
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
        .getByRole("button", { name: /Reasoning/u })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.queryByTestId("reasoning-status")).toBeNull();
    expect(screen.getByLabelText(/Reasoning time/u)).not.toBeNull();
  });

  test("calls the clear handler from the header", () => {
    const onClearMessages = vi.fn();

    render(
      <AiAssistantContents
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
    // jsdom does not implement `scrollIntoView`, so we install a stub on the
    // prototype and restore it afterwards. The `unbound-method` lint warning
    // is a false positive — we never invoke the saved reference, we only
    // assign it back.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    // Make rAF synchronous so the scroll effect runs before the assertion.
    window.requestAnimationFrame = (callback) => {
      callback(0);
      return 0;
    };
    window.cancelAnimationFrame = () => {};

    render(
      <AiAssistantContents
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

    expect(scrollIntoView).toHaveBeenCalled();
    window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  test("renders a streaming ellipsis for empty streaming reasoning", () => {
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
      <AiAssistantContents
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
      <AiAssistantContents
        input=""
        messages={messages}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    expect(screen.queryByRole("button", { name: /Reasoning/u })).toBeNull();
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
      <AiAssistantContents
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
      /Reasoning[\s\S]*I found the current places\./u,
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
      <AiAssistantContents
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
      <AiAssistantContents
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

  test("renders grouped tool rows with Figma-style tones and no item chevrons", () => {
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
      <AiAssistantContents
        input=""
        messages={messages}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="streaming"
      />,
    );

    expect(screen.getByRole("button", { name: /2 changes/u })).not.toBeNull();
    expect(screen.queryByTestId("tool-item-chevron")).toBeNull();
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
  });

  test("auto-collapses grouped changes once every tool is complete", () => {
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
      <AiAssistantContents
        input=""
        messages={messages}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
      />,
    );

    expect(
      screen
        .getByRole("button", { name: /2 changes/u })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });

  test("keeps net definition checks separate from grouped changes", () => {
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
      <AiAssistantContents
        input=""
        messages={messages}
        onClose={noop}
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
    expect(screen.getByRole("button", { name: /2 changes/u })).not.toBeNull();
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
      <AiAssistantContents
        input=""
        messages={messages}
        onClose={noop}
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
      <AiAssistantContents
        input=""
        messages={messages}
        onClose={noop}
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
});
