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
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { VoiceInterviewControlView } from "./voice-interview-control";

import type { VoiceTurnSnapshot } from "./voice-turn-controller";

const listeningSnapshot = {
  canReviseLastAnswer: false,
  connection: "connected",
  currentQuestion: "What happens after approval?",
  errorCode: null,
  errorMessage: "",
  errorRequestId: "",
  input: "listening",
  lastAnswerDelivery: "none",
  lastCommittedText: "",
  microphoneEnabled: true,
  microphoneLevel: 0.24,
  output: "idle",
  partialText: "The request goes to dispatch",
} satisfies VoiceTurnSnapshot;

const renderView = (
  snapshot: VoiceTurnSnapshot,
  callbacks: {
    onEnd?: () => void;
    onPause?: () => void;
    onReconnect?: () => void;
    onResume?: () => void;
  } = {},
) =>
  render(
    <VoiceInterviewControlView
      onEnd={callbacks.onEnd ?? vi.fn()}
      onPause={callbacks.onPause ?? vi.fn()}
      onReconnect={callbacks.onReconnect ?? vi.fn()}
      onResume={callbacks.onResume ?? vi.fn()}
      snapshot={snapshot}
    />,
  );

beforeEach(() => {
  vi.stubGlobal(
    "PointerEvent",
    class extends MouseEvent {
      public readonly pointerType: string;

      public constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? "";
      }
    },
  );
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("VoiceInterviewControlView", () => {
  test("renders partial speech immediately before one inline status divider", () => {
    const { container, rerender } = renderView(listeningSnapshot);

    const partial = screen.getByTestId("voice-partial-bubble");
    const divider = screen.getByTestId("voice-status-divider");

    expect(partial.textContent).toContain("The request goes to dispatch");
    expect(partial.getAttribute("data-role")).toBe("user");
    expect(partial.querySelector('[aria-label="Voice input"]')).not.toBeNull();
    expect(partial.nextElementSibling).toBe(divider);
    expect(
      screen.getAllByRole("status", { name: "Voice status" }),
    ).toHaveLength(1);
    expect(container.textContent).not.toMatch(
      /What happens after approval|Live transcript|Your answer|Coverage|Still exploring|Recording|Sending|Sent|Use text instead/u,
    );
    expect(
      screen.queryByRole("region", { name: "Voice interview stage" }),
    ).toBeNull();
    expect(
      screen.queryByRole("region", { name: "Voice interview mini bar" }),
    ).toBeNull();

    rerender(
      <VoiceInterviewControlView
        onEnd={vi.fn()}
        onPause={vi.fn()}
        onReconnect={vi.fn()}
        onResume={vi.fn()}
        snapshot={{ ...listeningSnapshot, partialText: "" }}
      />,
    );
    expect(screen.queryByTestId("voice-partial-bubble")).toBeNull();
  });

  test("keeps finalized speech visible until its canonical input is represented", () => {
    const pendingSnapshot = {
      ...listeningSnapshot,
      input: "submitting",
      lastAnswerDelivery: "pending",
      lastCommittedText: "The request goes to dispatch",
      output: "waiting-for-tool",
      partialText: "",
    } satisfies VoiceTurnSnapshot;
    const rendered = render(
      <VoiceInterviewControlView
        committedTextRepresented={false}
        onEnd={vi.fn()}
        onPause={vi.fn()}
        onReconnect={vi.fn()}
        onResume={vi.fn()}
        snapshot={pendingSnapshot}
      />,
    );

    const bufferedBubble = screen.getByTestId("voice-partial-bubble");
    expect(bufferedBubble.textContent).toContain(
      "The request goes to dispatch",
    );
    expect(bufferedBubble.querySelector('[aria-label="Voice input"]')).not.toBe(
      null,
    );
    expect(bufferedBubble.textContent).not.toMatch(/Recording|Sending|Sent/u);

    rendered.rerender(
      <VoiceInterviewControlView
        committedTextRepresented={true}
        onEnd={vi.fn()}
        onPause={vi.fn()}
        onReconnect={vi.fn()}
        onResume={vi.fn()}
        snapshot={pendingSnapshot}
      />,
    );

    expect(screen.queryByTestId("voice-partial-bubble")).toBeNull();
  });

  test("maps microphone level to the listening waveform without changing the message flow", () => {
    const rendered = renderView({
      ...listeningSnapshot,
      microphoneLevel: 0.05,
      partialText: "",
    });
    const waveform = screen.getByTestId("voice-status-waveform");
    const quietHeights = [...waveform.children].map(
      (bar) => (bar as HTMLElement).style.height,
    );

    expect(waveform.getAttribute("data-variant")).toBe("listening");
    expect(screen.getByText("Listening")).not.toBeNull();

    rendered.rerender(
      <VoiceInterviewControlView
        onEnd={vi.fn()}
        onPause={vi.fn()}
        onReconnect={vi.fn()}
        onResume={vi.fn()}
        snapshot={{
          ...listeningSnapshot,
          microphoneLevel: 0.8,
          partialText: "",
        }}
      />,
    );

    expect(
      [...waveform.children].map((bar) => (bar as HTMLElement).style.height),
    ).not.toEqual(quietHeights);
  });

  test("coalesces partial transcript announcements without announcing microphone frames", async () => {
    vi.useFakeTimers();
    const rendered = renderView({
      ...listeningSnapshot,
      partialText: "The request",
    });
    const partialAnnouncement = screen.getByRole("status", {
      name: "Voice transcript",
    });
    const statusAnnouncement = screen.getByRole("status", {
      name: "Voice status",
    });

    expect(partialAnnouncement.textContent).toBe("The request");
    expect(partialAnnouncement.getAttribute("aria-live")).toBe("polite");
    expect(partialAnnouncement.getAttribute("aria-atomic")).toBe("true");
    expect(statusAnnouncement.textContent).toBe("Voice status: Listening");

    rendered.rerender(
      <VoiceInterviewControlView
        onEnd={vi.fn()}
        onPause={vi.fn()}
        onReconnect={vi.fn()}
        onResume={vi.fn()}
        snapshot={{
          ...listeningSnapshot,
          microphoneLevel: 0.45,
          partialText: "The request goes",
        }}
      />,
    );
    await act(() => vi.advanceTimersByTimeAsync(200));
    rendered.rerender(
      <VoiceInterviewControlView
        onEnd={vi.fn()}
        onPause={vi.fn()}
        onReconnect={vi.fn()}
        onResume={vi.fn()}
        snapshot={{
          ...listeningSnapshot,
          microphoneLevel: 0.8,
          partialText: "The request goes to dispatch",
        }}
      />,
    );

    expect(partialAnnouncement.textContent).toBe("The request");
    expect(statusAnnouncement.textContent).toBe("Voice status: Listening");

    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(partialAnnouncement.textContent).toBe(
      "The request goes to dispatch",
    );
    expect(statusAnnouncement.textContent).toBe("Voice status: Listening");
  });

  test("announces continuous transcript updates periodically and flushes final text", async () => {
    vi.useFakeTimers();
    const rendered = renderView({
      ...listeningSnapshot,
      partialText: "The",
    });
    const announcement = screen.getByRole("status", {
      name: "Voice transcript",
    });

    await act(() => vi.advanceTimersByTimeAsync(200));
    rendered.rerender(
      <VoiceInterviewControlView
        onEnd={vi.fn()}
        onPause={vi.fn()}
        onReconnect={vi.fn()}
        onResume={vi.fn()}
        snapshot={{
          ...listeningSnapshot,
          microphoneLevel: 0.4,
          partialText: "The request",
        }}
      />,
    );
    await act(() => vi.advanceTimersByTimeAsync(200));
    rendered.rerender(
      <VoiceInterviewControlView
        onEnd={vi.fn()}
        onPause={vi.fn()}
        onReconnect={vi.fn()}
        onResume={vi.fn()}
        snapshot={{
          ...listeningSnapshot,
          microphoneLevel: 0.8,
          partialText: "The request goes",
        }}
      />,
    );
    await act(() => vi.advanceTimersByTimeAsync(100));

    expect(announcement.textContent).toBe("The request goes");

    rendered.rerender(
      <VoiceInterviewControlView
        onEnd={vi.fn()}
        onPause={vi.fn()}
        onReconnect={vi.fn()}
        onResume={vi.fn()}
        snapshot={{
          ...listeningSnapshot,
          partialText: "The request goes to",
        }}
      />,
    );
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(announcement.textContent).toBe("The request goes to");

    rendered.rerender(
      <VoiceInterviewControlView
        onEnd={vi.fn()}
        onPause={vi.fn()}
        onReconnect={vi.fn()}
        onResume={vi.fn()}
        snapshot={{
          ...listeningSnapshot,
          partialText: "The request goes to dispatch",
        }}
      />,
    );
    rendered.rerender(
      <VoiceInterviewControlView
        onEnd={vi.fn()}
        onPause={vi.fn()}
        onReconnect={vi.fn()}
        onResume={vi.fn()}
        snapshot={{
          ...listeningSnapshot,
          partialText: "",
        }}
      />,
    );
    await act(async () => {});

    expect(announcement.textContent).toBe("The request goes to dispatch");
  });

  test("uses a deterministic looping waveform while the assistant speaks", () => {
    const rendered = renderView({
      ...listeningSnapshot,
      microphoneLevel: 0.1,
      output: "speaking",
      partialText: "",
    });
    const waveform = screen.getByTestId("voice-status-waveform");
    const speakingHeights = [...waveform.children].map(
      (bar) => (bar as HTMLElement).style.height,
    );

    expect(screen.getByText("Speaking")).not.toBeNull();
    expect(waveform.getAttribute("data-variant")).toBe("speaking");
    expect(waveform.className).toContain("anim-n_pulse");
    expect(waveform.className).toContain("prefers-reduced-motion");
    expect(waveform.className).toContain("anim-n_[none]");

    rendered.rerender(
      <VoiceInterviewControlView
        onEnd={vi.fn()}
        onPause={vi.fn()}
        onReconnect={vi.fn()}
        onResume={vi.fn()}
        snapshot={{
          ...listeningSnapshot,
          microphoneLevel: 0.9,
          output: "speaking",
          partialText: "",
        }}
      />,
    );

    expect(
      [...waveform.children].map((bar) => (bar as HTMLElement).style.height),
    ).toEqual(speakingHeights);
  });

  test("shows paused and concise recovery states from the orthogonal snapshot", () => {
    const rendered = renderView({
      ...listeningSnapshot,
      input: "paused",
      microphoneEnabled: false,
      microphoneLevel: 0,
      partialText: "",
    });

    expect(screen.getByText("Paused")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Resume" })).not.toBeNull();

    rendered.rerender(
      <VoiceInterviewControlView
        onEnd={vi.fn()}
        onPause={vi.fn()}
        onReconnect={vi.fn()}
        onResume={vi.fn()}
        snapshot={{
          ...listeningSnapshot,
          connection: "error",
          errorCode: "microphone-permission",
          errorMessage: "Allow microphone access, then reconnect.",
          input: "paused",
          microphoneEnabled: false,
          microphoneLevel: 0,
          partialText: "",
        }}
      />,
    );

    expect(screen.getByText("Microphone unavailable")).not.toBeNull();
    expect(
      screen.getByText("Allow microphone access, then reconnect."),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Reconnect" })).not.toBeNull();
    const technicalDetails = screen
      .getByText("Technical details")
      .closest("details");
    expect(technicalDetails?.open).toBe(false);
    expect(technicalDetails?.textContent).toContain("microphone-permission");
  });

  test("shows the connecting state before listening begins", () => {
    renderView({
      ...listeningSnapshot,
      connection: "connecting",
      input: "paused",
      microphoneEnabled: false,
      microphoneLevel: 0,
      partialText: "",
    });

    expect(screen.getByText("Connecting")).not.toBeNull();
    expect(
      screen.getByTestId("voice-status-waveform").getAttribute("data-variant"),
    ).toBe("connecting");
  });

  test("keeps only Resume or Reconnect primary and moves Pause and End to overflow", async () => {
    const onEnd = vi.fn();
    const onPause = vi.fn();
    const onReconnect = vi.fn();
    const onResume = vi.fn();
    const rendered = renderView(listeningSnapshot, {
      onEnd,
      onPause,
      onReconnect,
      onResume,
    });

    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    expect(screen.queryByRole("button", { name: "End voice mode" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reconnect" })).toBeNull();

    const actions = screen.getByRole("button", {
      name: "Voice mode actions",
    });
    fireEvent.click(actions);
    const pauseItem = await screen.findByRole("menuitem", { name: "Pause" });
    await act(async () => {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    });
    fireEvent.pointerMove(pauseItem, { pointerType: "mouse" });
    await waitFor(() =>
      expect(pauseItem.hasAttribute("data-highlighted")).toBe(true),
    );
    fireEvent.click(pauseItem);
    await waitFor(() => expect(onPause).toHaveBeenCalledOnce());
    fireEvent.click(actions);
    const endItem = await screen.findByRole("menuitem", {
      name: "End voice mode",
    });
    fireEvent.pointerMove(endItem, { pointerType: "mouse" });
    await waitFor(() =>
      expect(endItem.hasAttribute("data-highlighted")).toBe(true),
    );
    fireEvent.click(endItem);
    await waitFor(() => expect(onEnd).toHaveBeenCalledOnce());
    fireEvent.click(actions);
    await screen.findByRole("menuitem", { name: "Pause" });
    const escapeMenu = screen.getByRole("menu");
    await waitFor(() => expect(document.activeElement).toBe(escapeMenu));
    fireEvent.keyDown(escapeMenu, {
      code: "Escape",
      key: "Escape",
    });
    await waitFor(() =>
      expect(screen.queryByRole("menuitem", { name: "Pause" })).toBeNull(),
    );
    expect(document.activeElement).toBe(actions);

    rendered.rerender(
      <VoiceInterviewControlView
        onEnd={onEnd}
        onPause={onPause}
        onReconnect={onReconnect}
        onResume={onResume}
        snapshot={{
          ...listeningSnapshot,
          input: "paused",
          microphoneEnabled: false,
          microphoneLevel: 0,
          partialText: "",
        }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(onResume).toHaveBeenCalledOnce();

    rendered.rerender(
      <VoiceInterviewControlView
        onEnd={onEnd}
        onPause={onPause}
        onReconnect={onReconnect}
        onResume={onResume}
        snapshot={{
          ...listeningSnapshot,
          connection: "error",
          errorCode: "network",
          errorMessage: "Check your connection, then reconnect.",
          errorRequestId: "request-safe-reference",
          input: "paused",
          microphoneEnabled: false,
          microphoneLevel: 0,
          partialText: "",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(onReconnect).toHaveBeenCalledOnce();
    const technicalDetails = screen
      .getByText("Technical details")
      .closest("details");
    expect(technicalDetails?.open).toBe(false);
    expect(technicalDetails?.textContent).toContain("network");
    expect(technicalDetails?.textContent).toContain("request-safe-reference");
    expect(technicalDetails?.textContent).not.toContain(
      listeningSnapshot.partialText,
    );
  });
});
