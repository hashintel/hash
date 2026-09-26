// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { createReadableStore } from "@hashintel/petrinaut-core";
import {
  PetrinautInstanceContext,
  prepareExperiment,
} from "@hashintel/petrinaut/react";

import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
} from "../local-storage-demo/brunch-panel-transport";
import {
  resetSessionDrafts,
  sessionDraftsFor,
} from "../shared/brunch-draft-experiment-drafts";
import { createLiveConversation } from "./live-conversation";
import {
  LIVE_VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY,
  loadOpenAIVoiceConfig,
  VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY,
  VoiceInterviewControl,
} from "./voice-interview-control";

import type { FlueClient, FlueConversationState } from "@flue/sdk";
import type { DraftPetrinautExperimentInput } from "@hashintel/brunch-agent-plugin-sdcpn";
import type {
  Petrinaut,
  PetrinautExperimentRequest,
  SDCPN,
} from "@hashintel/petrinaut-core";
import type { PetrinautAiVoiceModeContext } from "@hashintel/petrinaut/ui";

const liveConversationMocks = vi.hoisted(() => ({
  setMicrophoneMuted: vi.fn(),
  setSpeakerMuted: vi.fn(),
  setSpeakerVolume: vi.fn(),
  stop: vi.fn(async () => {}),
}));

vi.mock("./live-conversation", () => ({
  createLiveConversation: vi.fn(() => ({
    retryPlayback: vi.fn(async () => {}),
    start: vi.fn(async () => {}),
    stop: liveConversationMocks.stop,
    appendCommentary: vi.fn(() => true),
    appendInstructions: vi.fn(() => true),
    appendThinking: vi.fn(() => true),
    setMicrophoneMuted: liveConversationMocks.setMicrophoneMuted,
    setSpeakerMuted: liveConversationMocks.setSpeakerMuted,
    setSpeakerVolume: liveConversationMocks.setSpeakerVolume,
  })),
}));
beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    } satisfies Storage,
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
  resetSessionDrafts();
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
  registerVoiceModeSessionControls: vi.fn(() => () => {}),
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

test("starts Live directly after the voice disclosure is acknowledged", () => {
  window.localStorage.setItem(
    LIVE_VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY,
    "acknowledged",
  );

  render(<VoiceInterviewControl {...context()} config={config} />);

  expect(
    screen.queryByRole("region", { name: "Voice mode consent" }),
  ).toBeNull();
  expect(createLiveConversation).toHaveBeenCalledOnce();
});

test("does not reuse the Realtime voice disclosure acknowledgement", () => {
  window.localStorage.setItem(
    VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY,
    "acknowledged",
  );

  render(<VoiceInterviewControl {...context()} config={config} />);

  expect(
    screen.getByRole("region", { name: "Voice mode consent" }),
  ).toBeTruthy();
  expect(createLiveConversation).not.toHaveBeenCalled();
});

test("starts acknowledged Live after the previous session finishes stopping", () => {
  window.localStorage.setItem(
    LIVE_VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY,
    "acknowledged",
  );
  const props = context();
  const { rerender } = render(
    <VoiceInterviewControl {...props} config={config} />,
  );
  expect(createLiveConversation).toHaveBeenCalledOnce();
  const onState = vi.mocked(createLiveConversation).mock.calls[0]![0];
  act(() => onState({ phase: "connected", message: null }));
  rerender(
    <VoiceInterviewControl {...props} inputMode="text" config={config} />,
  );
  act(() => onState({ phase: "stopping", message: null }));

  rerender(<VoiceInterviewControl {...props} config={config} />);

  expect(createLiveConversation).toHaveBeenCalledOnce();
  act(() =>
    onState({
      phase: "ended",
      message: "Microphone and playback stopped.",
    }),
  );
  expect(createLiveConversation).toHaveBeenCalledTimes(2);
});

test("records the voice disclosure acknowledgement when Live starts", async () => {
  render(<VoiceInterviewControl {...context()} config={config} />);

  expect(
    window.localStorage.getItem(VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY),
  ).toBeNull();
  await start();
  expect(
    window.localStorage.getItem(LIVE_VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY),
  ).toBe("acknowledged");
  expect(
    window.localStorage.getItem(VOICE_INTERVIEW_DISCLOSURE_STORAGE_KEY),
  ).toBeNull();
});

test("retries an acknowledged Live failure without requesting consent again", async () => {
  render(<VoiceInterviewControl {...context()} config={config} />);
  await start();
  const onState = vi.mocked(createLiveConversation).mock.calls[0]![0];

  act(() =>
    onState({
      phase: "error",
      message: "Live media connection ended.",
    }),
  );

  expect(
    screen.queryByRole("region", { name: "Voice mode consent" }),
  ).toBeNull();
  expect(screen.getByRole("region", { name: "Voice mode retry" })).toBeTruthy();
  expect(screen.queryByRole("checkbox")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Retry voice" }));

  expect(createLiveConversation).toHaveBeenCalledTimes(2);
});

test("starts only one Live session when Start is activated twice", async () => {
  render(<VoiceInterviewControl {...context()} config={config} />);
  fireEvent.click(screen.getByRole("checkbox"));
  const startButton = await screen.findByRole("button", {
    name: "Start voice",
  });
  await waitFor(() => expect(startButton.hasAttribute("disabled")).toBe(false));
  act(() => {
    startButton.click();
    startButton.click();
  });
  expect(createLiveConversation).toHaveBeenCalledOnce();
});

test("Cancel leaves consent without starting a provider session", () => {
  const props = context();
  render(<VoiceInterviewControl {...props} config={config} />);
  fireEvent.click(screen.getByRole("checkbox"));
  expect(createLiveConversation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(props.setInputMode).toHaveBeenCalledWith("text");
  expect(createLiveConversation).not.toHaveBeenCalled();
});

test.each(["submitted", "streaming"] as const)(
  "maps Brunch %s to thinking without replacing playback or connection status",
  async (status) => {
    const props = context();
    const { rerender } = render(
      <VoiceInterviewControl {...props} config={config} />,
    );
    await start();
    const onState = vi.mocked(createLiveConversation).mock.calls[0]![0];
    act(() => onState({ phase: "connected", message: null }));

    // A composer update must change the dock without another audio event.
    rerender(
      <VoiceInterviewControl {...props} config={config} status={status} />,
    );
    expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "thinking" }),
    );
    act(() =>
      onState({
        phase: "connected",
        message: null,
        activity: { microphoneLevel: 0.2, outputActive: true },
      }),
    );
    expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "speaking" }),
    );
    act(() =>
      onState({
        phase: "connected",
        message: null,
        activity: { microphoneLevel: 0.2, outputActive: false },
      }),
    );
    expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "thinking" }),
    );
    rerender(
      <VoiceInterviewControl
        {...props}
        config={config}
        canAcceptVoiceInput={false}
      />,
    );
    expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "listening" }),
    );
    rerender(
      <VoiceInterviewControl
        {...props}
        config={config}
        status={status}
        stopped
      />,
    );
    expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "listening" }),
    );
    expect(liveConversationMocks.stop).not.toHaveBeenCalled();
    rerender(
      <VoiceInterviewControl {...props} config={config} status={status} />,
    );
    act(() => onState({ phase: "connecting", message: null }));
    expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "connecting" }),
    );
    act(() => onState({ phase: "error", message: "Connection lost" }));
    expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "error" }),
    );
  },
);

test("reuses setup and reports failure to the host dock and notification surface", async () => {
  const props = context();
  const audioSettings: unknown = expect.objectContaining({
    voice: "marin",
    activeVoice: "marin",
    devices: expect.objectContaining({
      microphoneId: "",
      speakerId: "",
    }) as unknown,
  });
  render(<VoiceInterviewControl {...props} config={config} />);
  expect(
    screen.getByRole("region", { name: "Voice mode consent" }),
  ).toBeTruthy();
  expect(screen.getByText("Start a voice conversation")).toBeTruthy();
  expect(screen.getByText(/OpenAI processes microphone audio/)).toBeTruthy();
  expect(screen.queryByText(/experimental|best-effort/i)).toBeNull();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Start voice" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(createLiveConversation).not.toHaveBeenCalled();
  await start();
  expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(
    expect.objectContaining({
      phase: "connecting",
      notice: null,
      warningMessage: null,
    }),
  );
  const onState = vi.mocked(createLiveConversation).mock.calls[0]![0];
  act(() => onState({ phase: "connected", message: null }));
  expect(
    screen.queryByRole("region", { name: "Voice mode consent" }),
  ).toBeNull();
  expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith({
    audioSettings,
    phase: "listening",
    microphoneLevel: 0,
    microphoneMuted: false,
    speakerMuted: false,
    speakerVolume: 1,
    errorMessage: null,
    notice: null,
    warningMessage: null,
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
  act(() => onState({ phase: "connecting", message: null }));
  expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(
    expect.objectContaining({ phase: "connecting", microphoneLevel: 0 }),
  );
  expect(
    screen.queryByRole("region", { name: "Voice mode consent" }),
  ).toBeNull();
  expect(createLiveConversation).toHaveBeenCalledOnce();
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
  const playbackNotice =
    "Audio playback is blocked. Select Play voice audio to hear Live.";
  act(() =>
    onState({
      phase: "connected",
      message: playbackNotice,
      playbackBlocked: true,
    }),
  );
  expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith({
    audioSettings,
    canRetryPlayback: true,
    phase: "listening",
    microphoneLevel: 0,
    microphoneMuted: false,
    errorMessage: null,
    notice: playbackNotice,
    speakerMuted: false,
    speakerVolume: 1,
    warningMessage: null,
  });
  if (!props.registerVoiceModeSessionControls)
    throw new Error("Session control registration was not provided");
  const controls = vi.mocked(props.registerVoiceModeSessionControls).mock
    .lastCall![0];
  expect(props.registerVoiceModeControls).not.toHaveBeenCalled();
  expect(Object.keys(controls).sort()).toEqual([
    "audioSettings",
    "end",
    "pause",
    "retryPlayback",
    "setMicrophoneMuted",
    "setSpeakerMuted",
    "setSpeakerVolume",
  ]);
  controls.retryPlayback?.();
  const liveSession = vi.mocked(createLiveConversation).mock.results[0]!
    .value as ReturnType<typeof createLiveConversation>;
  expect(liveSession.retryPlayback).toHaveBeenCalledOnce();
  const connectionError =
    "live session request failed (HTTP 502, provider HTTP 401). No automatic retry was made.";
  act(() =>
    onState({
      phase: "error",
      message: connectionError,
    }),
  );
  expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith({
    audioSettings,
    phase: "error",
    errorMessage: connectionError,
    microphoneLevel: 0,
    microphoneMuted: true,
    notice: null,
    speakerMuted: false,
    speakerVolume: 1,
    warningMessage: null,
  });
  expect(screen.getByText(connectionError)).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Retry voice" })
      .hasAttribute("disabled"),
  ).toBe(false);
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(createLiveConversation).toHaveBeenCalledOnce();
});

test("registers truthful microphone and speaker controls for the same Live session", async () => {
  const props = context();
  const { rerender } = render(
    <VoiceInterviewControl {...props} config={config} />,
  );
  await start();
  const onState = vi.mocked(createLiveConversation).mock.lastCall![0];
  act(() =>
    onState({
      phase: "connected",
      message: null,
      activity: { microphoneLevel: 0.42, outputActive: false },
    }),
  );
  if (!props.registerVoiceModeSessionControls)
    throw new Error("Session control registration was not provided");
  const controls = vi.mocked(props.registerVoiceModeSessionControls).mock
    .lastCall![0];

  act(() => controls.setMicrophoneMuted?.(true));
  expect(liveConversationMocks.setMicrophoneMuted).toHaveBeenCalledWith(true);
  expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(
    expect.objectContaining({
      microphoneLevel: 0,
      microphoneMuted: true,
      phase: "muted",
    }),
  );

  act(() =>
    onState({
      phase: "connected",
      message: null,
      activity: { microphoneLevel: 0.8, outputActive: true },
    }),
  );
  expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(
    expect.objectContaining({
      microphoneLevel: 0,
      microphoneMuted: true,
      phase: "speaking",
    }),
  );

  act(() => controls.setSpeakerMuted?.(true));
  act(() => controls.setSpeakerVolume?.(0));
  expect(liveConversationMocks.setSpeakerMuted).toHaveBeenCalledWith(true);
  expect(liveConversationMocks.setSpeakerVolume).toHaveBeenCalledWith(0);
  expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(
    expect.objectContaining({
      phase: "speaking",
      speakerMuted: true,
      speakerVolume: 0,
    }),
  );

  act(() =>
    onState({
      phase: "connected",
      message: null,
      activity: { microphoneLevel: 0.8, outputActive: false },
    }),
  );
  rerender(
    <VoiceInterviewControl {...props} config={config} status="streaming" />,
  );
  expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(
    expect.objectContaining({
      microphoneMuted: true,
      phase: "thinking",
      speakerMuted: true,
      speakerVolume: 0,
    }),
  );

  act(() => controls.setMicrophoneMuted?.(false));
  expect(liveConversationMocks.setMicrophoneMuted).toHaveBeenLastCalledWith(
    false,
  );
});

test("ignores media controls without a usable Live session", async () => {
  const props = context();
  render(<VoiceInterviewControl {...props} config={config} />);
  if (!props.registerVoiceModeSessionControls)
    throw new Error("Session control registration was not provided");
  const controls = vi.mocked(props.registerVoiceModeSessionControls).mock
    .lastCall![0];

  act(() => {
    controls.setMicrophoneMuted?.(true);
    controls.setSpeakerMuted?.(true);
    controls.setSpeakerVolume?.(0.4);
  });

  expect(liveConversationMocks.setMicrophoneMuted).not.toHaveBeenCalled();
  expect(liveConversationMocks.setSpeakerMuted).not.toHaveBeenCalled();
  expect(liveConversationMocks.setSpeakerVolume).not.toHaveBeenCalled();

  await start();
  const onState = vi.mocked(createLiveConversation).mock.lastCall![0];
  act(() => onState({ phase: "connected", message: null }));
  act(() =>
    onState({
      phase: "error",
      message: "Live media connection ended.",
    }),
  );
  liveConversationMocks.setMicrophoneMuted.mockClear();
  liveConversationMocks.setSpeakerMuted.mockClear();
  liveConversationMocks.setSpeakerVolume.mockClear();
  vi.mocked(props.reportVoiceSessionState).mockClear();

  act(() => {
    controls.setMicrophoneMuted?.(true);
    controls.setSpeakerMuted?.(true);
    controls.setSpeakerVolume?.(0.4);
  });

  expect(liveConversationMocks.setMicrophoneMuted).not.toHaveBeenCalled();
  expect(liveConversationMocks.setSpeakerMuted).not.toHaveBeenCalled();
  expect(liveConversationMocks.setSpeakerVolume).not.toHaveBeenCalled();
  expect(props.reportVoiceSessionState).not.toHaveBeenCalled();
});

test("caches speaker controls while a Live session is connecting", async () => {
  const props = context();
  render(<VoiceInterviewControl {...props} config={config} />);
  await start();
  if (!props.registerVoiceModeSessionControls)
    throw new Error("Session control registration was not provided");
  const controls = vi.mocked(props.registerVoiceModeSessionControls).mock
    .lastCall![0];
  liveConversationMocks.setSpeakerMuted.mockClear();
  liveConversationMocks.setSpeakerVolume.mockClear();

  act(() => {
    controls.setSpeakerMuted?.(true);
    controls.setSpeakerVolume?.(0.4);
  });

  expect(liveConversationMocks.setSpeakerMuted).toHaveBeenCalledExactlyOnceWith(
    true,
  );
  expect(
    liveConversationMocks.setSpeakerVolume,
  ).toHaveBeenCalledExactlyOnceWith(0.4);
  expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(
    expect.objectContaining({
      phase: "connecting",
      speakerMuted: true,
      speakerVolume: 0.4,
    }),
  );
});

test("ignores media controls as soon as a Live session ends", async () => {
  const props = context();
  render(<VoiceInterviewControl {...props} config={config} />);
  await start();
  if (!props.registerVoiceModeSessionControls)
    throw new Error("Session control registration was not provided");
  const controls = vi.mocked(props.registerVoiceModeSessionControls).mock
    .lastCall![0];
  const onState = vi.mocked(createLiveConversation).mock.lastCall![0];
  act(() => onState({ phase: "connected", message: null }));

  await act(() => controls.end());
  liveConversationMocks.setMicrophoneMuted.mockClear();
  liveConversationMocks.setSpeakerMuted.mockClear();
  liveConversationMocks.setSpeakerVolume.mockClear();
  vi.mocked(props.reportVoiceSessionState).mockClear();
  act(() => {
    controls.setMicrophoneMuted?.(true);
    controls.setSpeakerMuted?.(true);
    controls.setSpeakerVolume?.(0.4);
  });

  expect(liveConversationMocks.setMicrophoneMuted).not.toHaveBeenCalled();
  expect(liveConversationMocks.setSpeakerMuted).not.toHaveBeenCalled();
  expect(liveConversationMocks.setSpeakerVolume).not.toHaveBeenCalled();
  expect(props.reportVoiceSessionState).not.toHaveBeenCalled();
});

test("resets and applies audio defaults when a Live session restarts", async () => {
  const props = context();
  render(<VoiceInterviewControl {...props} config={config} />);
  await start();
  const firstOnState = vi.mocked(createLiveConversation).mock.calls[0]![0];
  act(() => firstOnState({ phase: "connected", message: null }));
  if (!props.registerVoiceModeSessionControls)
    throw new Error("Session control registration was not provided");
  const controls = vi.mocked(props.registerVoiceModeSessionControls).mock
    .lastCall![0];

  act(() => controls.setMicrophoneMuted?.(true));
  act(() => controls.setSpeakerMuted?.(true));
  act(() => controls.setSpeakerVolume?.(0.25));
  expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(
    expect.objectContaining({
      microphoneMuted: true,
      speakerMuted: true,
      speakerVolume: 0.25,
    }),
  );
  await act(() => controls.end());
  act(() =>
    firstOnState({
      phase: "ended",
      message: "Microphone and playback stopped.",
    }),
  );
  liveConversationMocks.setMicrophoneMuted.mockClear();
  liveConversationMocks.setSpeakerMuted.mockClear();
  liveConversationMocks.setSpeakerVolume.mockClear();

  fireEvent.click(screen.getByRole("button", { name: "Retry voice" }));

  expect(createLiveConversation).toHaveBeenCalledTimes(2);
  expect(
    liveConversationMocks.setMicrophoneMuted,
  ).toHaveBeenCalledExactlyOnceWith(false);
  expect(liveConversationMocks.setSpeakerMuted).toHaveBeenCalledExactlyOnceWith(
    false,
  );
  expect(
    liveConversationMocks.setSpeakerVolume,
  ).toHaveBeenCalledExactlyOnceWith(1);
  const secondOnState = vi.mocked(createLiveConversation).mock.calls[1]![0];
  act(() => secondOnState({ phase: "connected", message: null }));
  expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(
    expect.objectContaining({
      microphoneMuted: false,
      phase: "listening",
      speakerMuted: false,
      speakerVolume: 1,
    }),
  );
});

test("offers restart without showing consent after a Live session closes", async () => {
  render(<VoiceInterviewControl {...context()} config={config} />);
  await start();
  const onState = vi.mocked(createLiveConversation).mock.calls[0]![0];
  act(() => onState({ phase: "connected", message: null }));
  const closureMessage =
    "Microphone and playback stopped. Live confirmed session closure.";
  act(() => onState({ phase: "ended", message: closureMessage }));

  expect(
    screen.queryByRole("region", { name: "Voice mode consent" }),
  ).toBeNull();
  expect(screen.getByRole("region", { name: "Voice mode retry" })).toBeTruthy();
  expect(screen.queryByText(closureMessage)).toBeNull();
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
  if (!props.registerVoiceModeSessionControls)
    throw new Error("Session control registration was not provided");
  const controls = vi.mocked(props.registerVoiceModeSessionControls).mock
    .lastCall![0];
  await act(() => controls.end());
  expect(session.stop).toHaveBeenCalled();
  expect(props.submitText).not.toHaveBeenCalled();
  expect(props.submitVoiceInput).not.toHaveBeenCalled();
  expect(props.stop).not.toHaveBeenCalled();
  expect(subscribeToAdmission).not.toHaveBeenCalled();
  rerender(
    <VoiceInterviewControl
      {...props}
      inputMode="text"
      config={{ ...config, provider: "realtime" }}
    />,
  );
  // The next start must use Realtime's separate disclosure, without restarting Live.
  rerender(
    <VoiceInterviewControl
      {...props}
      config={{ ...config, provider: "realtime" }}
    />,
  );
  expect(createLiveConversation).toHaveBeenCalledOnce();
  expect(
    screen.getByText(
      "OpenAI processes live audio and speaks the interviewer’s words. Petrinaut saves finalized answers—not audio.",
    ),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Start voice" })).toBeTruthy();
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
  act(() => call[3]("delegation-1"));
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
    "delegation-1",
  );
  act(() => tracker.recordStopRequested());
  expect(session.stop).not.toHaveBeenCalled();
  await act(async () => call[2]({ id: "late", text: "Late transcription" }));
  expect(props.submitVoiceInput).toHaveBeenCalledTimes(2);
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
    expect(session.appendCommentary).toHaveBeenCalledExactlyOnceWith(
      text,
      null,
    );
  },
);

test.each(["commentary", "instructions"] as const)(
  "%s pending and accepted appends do not raise errors or replace actual failures",
  async (kind) => {
    const props = context();
    const { unmount } = render(
      <VoiceInterviewControl {...props} config={config} />,
    );
    await start();
    const call = vi.mocked(createLiveConversation).mock.lastCall!;
    act(() => call[0]({ phase: "connected", message: null }));
    const result = {
      eventId: "first",
      kind,
      delegationId: "delegation",
    };
    for (const eventId of ["first", "second"]) {
      for (const status of ["unknown", "accepted"] as const) {
        act(() => call[4]({ ...result, eventId, status }));
        expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(
          expect.objectContaining({
            phase: "listening",
            errorMessage: null,
            notice: null,
            warningMessage: null,
          }),
        );
      }
    }
    for (const [status, text] of [
      ["local-failure", "could not be sent to Live locally"],
      ["rejected", "was rejected by Live"],
    ] as const) {
      act(() => call[4]({ ...result, eventId: status, status }));
      expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(
        expect.objectContaining({
          phase: "listening",
          errorMessage: null,
          notice: null,
          warningMessage: expect.stringContaining(text) as unknown,
        }),
      );
      for (const nextStatus of ["unknown", "accepted"] as const) {
        act(() => call[4]({ ...result, eventId: "later", status: nextStatus }));
        expect(props.reportVoiceSessionState).toHaveBeenLastCalledWith(
          expect.objectContaining({
            notice: null,
            warningMessage: expect.stringContaining(text) as unknown,
          }),
        );
      }
    }
    unmount();
    vi.mocked(props.reportVoiceSessionState).mockClear();
    act(() => call[4]({ ...result, status: "rejected" }));
    expect(props.reportVoiceSessionState).not.toHaveBeenCalled();
  },
);

test("inside a Petrinaut editor, a playback word reaches the canvas and a drafted experiment reaches Live as quiet context", async () => {
  const definition = createReadableStore<SDCPN>({
    places: [],
    transitions: [],
    types: [],
    parameters: [],
    differentialEquations: [],
    scenarios: [
      {
        id: "scenario__peak",
        name: "Weekday peak",
        scenarioParameters: [
          { identifier: "agents", type: "integer", default: 5 },
        ],
        parameterOverrides: {},
        initialState: { type: "per_place", content: {} },
      },
    ],
    metrics: [
      { id: "metric__wait", name: "Average waiting time", code: "return 1;" },
    ],
  });
  const instance = { definition } as unknown as Petrinaut;
  const props = context();
  render(
    <PetrinautInstanceContext.Provider value={instance}>
      <VoiceInterviewControl {...props} config={config} />
    </PetrinautInstanceContext.Provider>,
  );
  await start();
  const call = vi.mocked(createLiveConversation).mock.lastCall!;
  const session = vi.mocked(createLiveConversation).mock.results.at(-1)!
    .value as ReturnType<typeof createLiveConversation>;
  act(() => call[0]({ phase: "connected", message: null }));

  act(() => call[3]("delegation-play"));
  await act(async () => call[2]({ id: "utterance-1", text: "Play." }));
  expect(props.submitVoiceInput).not.toHaveBeenCalled();
  expect(session.appendCommentary).toHaveBeenCalledExactlyOnceWith(
    "Playing.",
    "delegation-play",
  );

  const request: PetrinautExperimentRequest = {
    name: "Staffing the peak",
    scenarioId: "scenario__peak",
    scenarioParameterValues: { agents: { mode: "range", min: 2, max: 8 } },
    runCount: 20,
    seed: 7,
    dt: 1,
    maxTime: 120,
    metricIds: ["metric__wait"],
    execution: {
      mode: "optimize",
      objectiveMetricId: "metric__wait",
      direction: "minimize",
      steps: 3,
      runsPerStep: 5,
    },
  };
  act(() => {
    sessionDraftsFor(definition).register({
      toolCallId: "call_draft_1",
      input: {
        experiment: request,
      } as unknown as DraftPetrinautExperimentInput,
      definition: definition.get(),
      prepared: prepareExperiment(request, definition.get(), "Support desk"),
      invalid: null,
      dismissed: false,
      run: { phase: "idle" },
    });
  });
  expect(session.appendThinking).toHaveBeenCalledWith(
    expect.stringContaining(
      "Brunch drafted an experiment for this session. It has not run. Vary agents 2–8 under Weekday peak",
    ),
    null,
  );
});
