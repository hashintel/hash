// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
} from "../local-storage-demo/brunch-panel-transport";
import { createLiveConversation } from "./live-conversation";
import {
  loadOpenAIVoiceConfig,
  VoiceInterviewControl,
} from "./voice-interview-control";

import type { FlueClient, FlueConversationState } from "@flue/sdk";
import type { PetrinautAiVoiceModeContext } from "@hashintel/petrinaut/ui";

vi.mock("./live-conversation", () => ({
  createLiveConversation: vi.fn(() => ({
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    appendCommentary: vi.fn(() => true),
  })),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const context = (): PetrinautAiVoiceModeContext => ({
  conversationId: "standalone",
  messages: [],
  status: "ready",
  canAcceptVoiceInput: true,
  inputMode: "voice",
  isAiAssistantOpen: true,
  stop: vi.fn(async () => {}),
  submitText: vi.fn(),
  submitVoiceInput: vi.fn(),
  registerVoiceModeControls: vi.fn(() => () => {}),
  reportVoiceSessionState: vi.fn(),
  setInputMode: vi.fn(),
  setVoiceActive: vi.fn(),
});
const config = {
  available: true as const,
  provider: "live" as const,
  connectionTimeoutMs: 15_000,
};
const start = async () => {
  fireEvent.click(screen.getByRole("checkbox"));
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Start voice" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Start voice" }));
};

test("reuses setup, reports listening and speaking to the host dock, and clears it on failure", async () => {
  const props = context();
  render(<VoiceInterviewControl {...props} config={config} />);
  expect(
    screen.getByRole("region", { name: "Voice mode consent" }),
  ).toBeTruthy();
  expect(screen.getByText("GPT-Live · Experimental interview")).toBeTruthy();
  expect(screen.getByText(/separate transcription session/)).toBeTruthy();
  expect(screen.getByText(/best-effort/)).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Start voice" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(createLiveConversation).not.toHaveBeenCalled();
  await start();
  expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(
    expect.objectContaining({ phase: "connecting", notice: null }),
  );
  const onState = vi.mocked(createLiveConversation).mock.calls[0]![0];
  act(() => onState({ phase: "connected", message: null }));
  expect(
    screen.queryByRole("region", { name: "Voice mode consent" }),
  ).toBeNull();
  expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith({
    phase: "listening",
    microphoneLevel: 0,
    microphoneMuted: false,
    errorMessage: null,
    notice: null,
  });
  act(() =>
    onState({
      phase: "connected",
      message: null,
      activity: {
        microphoneLevel: 0.24,
        outputActive: true,
      },
    }),
  );
  expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(
    expect.objectContaining({
      phase: "speaking",
      microphoneLevel: 0.24,
      microphoneMuted: false,
    }),
  );
  act(() =>
    onState({
      phase: "connected",
      message: null,
      activity: {
        microphoneLevel: 0.12,
        outputActive: false,
      },
    }),
  );
  expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(
    expect.objectContaining({
      phase: "listening",
      microphoneLevel: 0.12,
    }),
  );
  const controls = vi.mocked(props.registerVoiceModeControls).mock.lastCall![0];
  expect(Object.keys(controls).sort()).toEqual(["end", "pause"]);
  const connectionError =
    "live session request failed (HTTP 502, provider HTTP 401). No automatic retry was made.";
  act(() =>
    onState({
      phase: "error",
      message: connectionError,
    }),
  );
  expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(null);
  expect(screen.getByText(connectionError)).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Start voice" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(createLiveConversation).toHaveBeenCalledOnce();
});

test("pins provider, ends through host controls, and never submits or stops canonical work", async () => {
  const props = context();
  const subscribeToAdmission = vi.fn();
  const { rerender, unmount } = render(
    <VoiceInterviewControl
      {...props}
      config={config}
      subscribeToAdmission={subscribeToAdmission}
    />,
  );
  await start();
  const session = vi.mocked(createLiveConversation).mock.results[0]!
    .value as ReturnType<typeof createLiveConversation>;
  rerender(
    <VoiceInterviewControl
      {...props}
      config={{ ...config, provider: "realtime" }}
    />,
  );
  expect(session.start).toHaveBeenCalledOnce();
  const controls = vi.mocked(props.registerVoiceModeControls).mock.lastCall![0];
  await act(() => controls.end());
  expect(session.stop).toHaveBeenCalled();
  expect(props.submitText).not.toHaveBeenCalled();
  expect(props.submitVoiceInput).not.toHaveBeenCalled();
  expect(props.stop).not.toHaveBeenCalled();
  expect(subscribeToAdmission).not.toHaveBeenCalled();
  unmount();
  expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(null);
});

test("closing the panel ends Live; reopening cannot restart it; stale callbacks cannot reset the next conversation", async () => {
  const props = context();
  const { rerender, unmount } = render(
    <VoiceInterviewControl {...props} config={config} />,
  );
  await start();
  const session = vi.mocked(createLiveConversation).mock.results[0]!
    .value as ReturnType<typeof createLiveConversation>;
  const onState = vi.mocked(createLiveConversation).mock.calls[0]![0];
  rerender(
    <VoiceInterviewControl
      {...props}
      config={config}
      isAiAssistantOpen={false}
    />,
  );
  await waitFor(() => expect(session.stop).toHaveBeenCalled());
  rerender(<VoiceInterviewControl {...props} config={config} />);
  expect(session.start).toHaveBeenCalledOnce();
  unmount();
  vi.mocked(props.setVoiceActive).mockClear();
  vi.mocked(props.reportVoiceSessionState).mockClear();
  onState({ phase: "ended", message: "Late close" });
  expect(props.setVoiceActive).not.toHaveBeenCalled();
  expect(props.reportVoiceSessionState).not.toHaveBeenCalled();
});

test.each(["live", "realtime", "live-experience"])(
  "validates provider config %s",
  async (provider) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ ...config, provider }),
    );
    expect(await loadOpenAIVoiceConfig(fetch)).toEqual(
      provider === "live-experience" ? null : { ...config, provider },
    );
  },
);

test("final transcription enters the real admission helper and only its settled canonical prose reaches Live", async () => {
  const tracker = new BrunchPanelConversationTracker();
  const props = context();
  props.submitVoiceInput = vi.fn<
    PetrinautAiVoiceModeContext["submitVoiceInput"]
  >(async ({ id }) => {
    if (!id) throw new Error("Missing stable input identity");
    tracker.recordAdmission({
      kind: "user",
      messageId: id,
      admission: {
        submissionId: "root",
        uid: "test",
        offset: "opaque",
        streamUrl: "http://local/stream",
      },
    });
    return { kind: "message", messageId: id };
  });
  const wiring = {
    resolveInputSubmission: tracker.submissionForInput.bind(tracker),
    resolveResponseSubmission: tracker.submissionsForResponse.bind(tracker),
    subscribeToAdmission: (
      target: Parameters<typeof tracker.subscribeToAdmission>[0],
      listener: (id: string) => void,
    ) =>
      tracker.subscribeToAdmission(target, (event) =>
        listener(event.admission.submissionId),
      ),
    subscribeToAdmissionFailure:
      tracker.subscribeToAdmissionFailure.bind(tracker),
    subscribeToResponseMessageStarted:
      tracker.subscribeToResponseMessageStarted.bind(tracker),
    subscribeToResponseMessageCompleted:
      tracker.subscribeToResponseMessageCompleted.bind(tracker),
    subscribeToStopRequested: tracker.subscribeToStopRequested.bind(tracker),
  };
  const { rerender } = render(
    <VoiceInterviewControl {...props} {...wiring} config={config} />,
  );
  await start();
  const call = vi.mocked(createLiveConversation).mock.lastCall!;
  const session = vi.mocked(createLiveConversation).mock.results.at(-1)!
    .value as ReturnType<typeof createLiveConversation>;
  act(() => call[0]({ phase: "connected", message: null }));
  await act(async () =>
    call[2]({ id: "utterance-1", text: "Seven reviewers, not four." }),
  );
  expect(props.submitVoiceInput).toHaveBeenCalledOnce();
  expect(props.submitVoiceInput).toHaveBeenCalledWith(
    expect.objectContaining({ text: "Seven reviewers, not four." }),
  );
  const response = {
    messageId: "answer",
    submissionId: "root",
    position: { batch: 1, index: 0 },
  };
  act(() => tracker.recordResponse(response));
  const messages: PetrinautAiVoiceModeContext["messages"] = [
    {
      id: "answer",
      role: "assistant",
      parts: [
        {
          type: "text",
          text: "Are all seven reviewers required?",
          state: "done",
        },
      ],
    },
  ];
  rerender(
    <VoiceInterviewControl
      {...props}
      {...wiring}
      messages={messages}
      status="streaming"
      config={config}
    />,
  );
  act(() =>
    tracker.recordResponseMessageCompleted({
      ...response,
      position: { batch: 2, index: 0 },
    }),
  );
  expect(session.appendCommentary).not.toHaveBeenCalled();
  rerender(
    <VoiceInterviewControl
      {...props}
      {...wiring}
      messages={messages}
      settlements={[{ submissionId: "root", outcome: "completed" }]}
      config={config}
    />,
  );
  expect(session.appendCommentary).toHaveBeenCalledExactlyOnceWith(
    "Are all seven reviewers required?",
  );
  act(() => tracker.recordStopRequested());
  expect(session.stop).toHaveBeenCalled();
  await act(async () => call[2]({ id: "late", text: "Late transcription" }));
  expect(props.submitVoiceInput).toHaveBeenCalledOnce();
});

test.each(["answer", "folded-answer"])(
  "the real transport's unobserved answered-by response reaches Live with rendered ID %s",
  async (renderedId) => {
    const tracker = new BrunchPanelConversationTracker();
    const props = context();
    const text = "Seven reviewers, not four. Is approval optional?";
    const snapshot: FlueConversationState = {
      conversationId: props.conversationId,
      messages: [
        {
          id: "answer",
          role: "assistant",
          purpose: "assistant",
          display: "visible",
          submissionId: "answering",
          parts: [
            {
              type: "reasoning",
              state: "done",
              text: "Private reasoning must not be spoken",
            },
            { type: "text", state: "done", text },
          ],
        },
      ],
      settlements: [
        {
          submissionId: "root",
          outcome: "completed",
          answeredBySubmissionId: "answering",
        },
        { submissionId: "answering", outcome: "completed" },
      ],
    };
    const client = {
      send: vi.fn<FlueClient["send"]>(async () => ({
        submissionId: "root",
        uid: "test",
        offset: "opaque",
        streamUrl: "http://local/stream",
      })),
      wait: vi.fn<FlueClient["wait"]>(async (_admission, options) => {
        await options?.onEvent?.({
          type: "message-started",
          conversationId: props.conversationId,
          messageId: "answer",
          submissionId: "answering",
          turnId: "turn",
          position: { batch: 1, index: 0 },
        });
        await options?.onEvent?.({
          type: "message-completed",
          conversationId: props.conversationId,
          messageId: "answer",
          position: { batch: 1, index: 1 },
        });
        await options?.onEvent?.({
          type: "submission-settled",
          conversationId: props.conversationId,
          submissionId: "root",
          outcome: "completed",
          answeredBySubmissionId: "answering",
          position: { batch: 1, index: 2 },
        });
      }),
    } as Pick<FlueClient, "send" | "wait"> as FlueClient;
    const transport = createBrunchPanelTransport(
      Promise.resolve(client),
      tracker,
    );
    props.submitVoiceInput = async ({ id, text: input }) => {
      if (!id) throw new Error("Missing identity");
      const stream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: props.conversationId,
        messageId: undefined,
        messages: [
          { id, role: "user", parts: [{ type: "text", text: input }] },
        ],
        abortSignal: undefined,
      });
      const reader = stream.getReader();
      while (!(await reader.read()).done) {
        /* drain the real transport */
      }
      return { kind: "message", messageId: id };
    };
    const wiring = {
      resolveInputSubmission: tracker.submissionForInput.bind(tracker),
      resolveResponseSubmission: tracker.submissionsForResponse.bind(tracker),
      subscribeToResponseMessageStarted:
        tracker.subscribeToResponseMessageStarted.bind(tracker),
      subscribeToResponseMessageCompleted:
        tracker.subscribeToResponseMessageCompleted.bind(tracker),
    };
    const { rerender } = render(
      <VoiceInterviewControl {...props} {...wiring} config={config} />,
    );
    await start();
    const call = vi.mocked(createLiveConversation).mock.lastCall!;
    const session = vi.mocked(createLiveConversation).mock.results.at(-1)!
      .value as ReturnType<typeof createLiveConversation>;
    act(() => call[0]({ phase: "connected", message: null }));
    await act(async () =>
      call[2]({ id: "utterance", text: "Seven, not four" }),
    );
    rerender(
      <VoiceInterviewControl
        {...props}
        {...wiring}
        status="streaming"
        config={config}
      />,
    );
    expect(tracker.submissionsForResponse("answer")).toBeUndefined();
    expect(tracker.canReplaceMessages(snapshot)).toBe(true);
    rerender(
      <VoiceInterviewControl
        {...props}
        {...wiring}
        settlements={snapshot.settlements}
        config={config}
      />,
    );
    expect(session.appendCommentary).not.toHaveBeenCalled();
    rerender(
      <VoiceInterviewControl
        {...props}
        {...wiring}
        snapshot={snapshot}
        messages={[
          {
            id: renderedId,
            role: "assistant",
            parts: [{ type: "text", state: "done", text }],
          },
        ]}
        settlements={snapshot.settlements}
        config={config}
      />,
    );
    expect(session.appendCommentary).toHaveBeenCalledExactlyOnceWith(text);
  },
);
