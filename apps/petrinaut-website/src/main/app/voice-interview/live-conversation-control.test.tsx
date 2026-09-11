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

import { createLiveConversation } from "./live-conversation";
import {
  loadOpenAIVoiceConfig,
  VoiceInterviewControl,
} from "./voice-interview-control";

import type { PetrinautAiVoiceModeContext } from "@hashintel/petrinaut/ui";

vi.mock("./live-conversation", () => ({
  createLiveConversation: vi.fn(() => ({
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
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
  expect(screen.queryByText(/Petrinaut saves finalized/)).toBeNull();
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
  act(() =>
    onState({
      phase: "error",
      message: "Connection failed. Remote session closure was not confirmed.",
    }),
  );
  expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(null);
  expect(
    screen.getByText(
      "Connection error. Check microphone and server configuration.",
    ),
  ).toBeTruthy();
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
