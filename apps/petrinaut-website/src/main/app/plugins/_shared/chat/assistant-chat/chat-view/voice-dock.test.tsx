/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

import { VoiceDock } from "./voice-dock";

const noop = () => {};

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
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

test("renders an interrupted session as an unlabeled scoped ribbon with recovery", () => {
  render(
    <VoiceDock
      actions={{ end: noop, pause: noop, reconnect: noop }}
      assistantBusy={false}
      canReadFullResponse={false}
      canRepeatQuestion={false}
      canTakeTurn={false}
      collapsed={false}
      indicator={<span />}
      microphoneMuted={false}
      onCollapsedToggle={noop}
      onStop={noop}
      phase="error"
      speakerMuted={false}
      speakerVolume={1}
    />,
  );
  const dock = screen.getByTestId("ai-voice-dock");
  expect(dock.querySelector('canvas[data-phase="error"]')).not.toBeNull();
  expect(dock.querySelector('[data-part="visible-status"]')).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("Voice interrupted");
  expect(
    screen.getByRole("button", { name: "Reconnect voice mode" }),
  ).toBeTruthy();
});

test("live-capability dock keeps microphone direct and Realtime controls absent", async () => {
  const end = vi.fn();
  const collapse = vi.fn();
  const setMicrophoneMuted = vi.fn();
  const setSpeakerMuted = vi.fn();
  const setSpeakerVolume = vi.fn();
  render(
    <VoiceDock
      actions={{
        end,
        pause: noop,
        setMicrophoneMuted,
        setSpeakerMuted,
        setSpeakerVolume,
      }}
      assistantBusy={false}
      canReadFullResponse={false}
      canRepeatQuestion={false}
      canTakeTurn={false}
      collapsed={false}
      indicator={<span />}
      microphoneMuted={false}
      onStop={noop}
      onCollapsedToggle={collapse}
      phase="connected"
      speakerMuted={false}
      speakerVolume={1}
    />,
  );
  expect(screen.getByText("Connected")).toBeTruthy();
  const microphone = screen.getByRole("button", { name: "Mute microphone" });
  expect(microphone).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Your turn" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Hide conversation" }));
  expect(collapse).toHaveBeenCalledOnce();
  fireEvent.click(microphone);
  expect(setMicrophoneMuted).toHaveBeenCalledWith(true);

  fireEvent.click(screen.getByRole("button", { name: "Audio options" }));
  expect(
    await screen.findByRole("button", { name: "Mute speaker" }),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("slider", { name: "Speaker volume" })
      .getAttribute("aria-valuenow"),
  ).toBe("100");
  expect(screen.queryByRole("button", { name: "Repeat question" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Read full reply" })).toBeNull();
  expect(
    screen.queryByRole("checkbox", { name: "Allow interruptions" }),
  ).toBeNull();
  expect(
    microphone.closest('[data-scope="popover"][data-part="content"]'),
  ).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "End voice mode" }));
  expect(end).toHaveBeenCalledOnce();
});

test("keeps crowded Voice actions fixed while status content can shrink", () => {
  render(
    <VoiceDock
      actions={{
        audioSettings: {
          refreshDevices: noop,
          requestSpeaker: noop,
          setMicrophoneDevice: noop,
          setSpeakerDevice: noop,
          setVoice: noop,
          stopVoicePreview: noop,
        },
        end: noop,
        pause: noop,
        retryPlayback: noop,
        setMicrophoneMuted: noop,
        setSpeakerMuted: noop,
        setSpeakerVolume: noop,
        takeTurn: noop,
      }}
      assistantBusy
      canReadFullResponse={false}
      canRepeatQuestion={false}
      canRetryPlayback
      canTakeTurn
      collapsed={false}
      indicator={<span data-testid="waveform" />}
      microphoneMuted={false}
      notice="Audio blocked. Select Play to listen."
      onCollapsedToggle={noop}
      onStop={noop}
      phase="speaking"
      speakerMuted={false}
      speakerVolume={1}
    />,
  );

  const dock = screen.getByTestId("ai-voice-dock");
  const getPart = (part: string) => {
    const element = dock.querySelector<HTMLElement>(`[data-part="${part}"]`);
    if (!element) throw new Error(`Missing Voice dock part: ${part}`);
    return element;
  };
  const leftActions = getPart("left-actions");
  const center = getPart("shrinkable-status");
  const indicator = getPart("fixed-indicator");
  const status = getPart("visible-status");
  const rightActions = getPart("right-actions");
  const liveStatus = getPart("live-status");

  expect(dock.className).toContain("d_grid");
  expect(dock.className).toContain("grid-tc_[auto_minmax(0,_1fr)_auto]");
  expect(leftActions.className).toContain("flex-sh_0");
  expect(rightActions.className).toContain("flex-sh_0");
  expect(center.className).toContain("min-w_[0]");
  expect(status.className).toContain("min-w_[0]");
  expect(indicator.className).toContain("flex-sh_1");
  expect(indicator.className).toContain("min-w_[32px]");
  expect(status.className).toContain("ov_hidden");
  expect(status.className).toContain("tov_ellipsis");
  expect(within(indicator).getByTestId("waveform")).toBeTruthy();
  expect(liveStatus.textContent).toBe(
    "Voice status: Audio blocked. Select Play to listen.",
  );
});

test("offers a user-gesture retry while session audio is blocked", () => {
  const retryPlayback = vi.fn();
  const commonProps = {
    actions: { end: noop, pause: noop, retryPlayback },
    assistantBusy: false,
    canReadFullResponse: false,
    canRepeatQuestion: false,
    canTakeTurn: false,
    collapsed: false,
    indicator: <span />,
    microphoneMuted: false,
    notice: "Audio blocked. Select Play to listen.",
    onCollapsedToggle: noop,
    onStop: noop,
    phase: "connected" as const,
    speakerMuted: false,
    speakerVolume: 1,
  };
  const rendered = render(
    <VoiceDock {...commonProps} canRetryPlayback={true} />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Play voice audio" }));
  expect(retryPlayback).toHaveBeenCalledOnce();

  rendered.rerender(<VoiceDock {...commonProps} canRetryPlayback={false} />);
  expect(screen.queryByRole("button", { name: "Play voice audio" })).toBeNull();
});

test.each([
  {
    absentAction: "Resume voice mode",
    phase: "error" as const,
    recoveryAction: "Reconnect voice mode",
  },
  {
    absentAction: "Reconnect voice mode",
    phase: "paused" as const,
    recoveryAction: "Resume voice mode",
  },
])(
  "keeps direct microphone beside $phase recovery controls",
  ({ absentAction, phase, recoveryAction }) => {
    render(
      <VoiceDock
        actions={{
          end: vi.fn(),
          pause: noop,
          reconnect: vi.fn(),
          resume: vi.fn(),
          setMicrophoneMuted: vi.fn(),
        }}
        assistantBusy={false}
        canReadFullResponse={false}
        canRepeatQuestion={false}
        canTakeTurn={false}
        collapsed={false}
        indicator={<span />}
        microphoneMuted={false}
        onCollapsedToggle={noop}
        onStop={noop}
        phase={phase}
        speakerMuted={false}
        speakerVolume={1}
      />,
    );

    expect(screen.getByRole("button", { name: recoveryAction })).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Mute microphone",
      }).disabled,
    ).toBe(true);
    expect(screen.queryByRole("button", { name: absentAction })).toBeNull();
  },
);

test.each(["connecting", "error", "paused"] as const)(
  "disables the direct microphone action while Voice is %s",
  (phase) => {
    const setMicrophoneMuted = vi.fn();
    render(
      <VoiceDock
        actions={{
          end: vi.fn(),
          pause: noop,
          setMicrophoneMuted,
        }}
        assistantBusy={false}
        canReadFullResponse={false}
        canRepeatQuestion={false}
        canTakeTurn={false}
        collapsed={false}
        indicator={<span />}
        microphoneMuted={false}
        onCollapsedToggle={noop}
        onStop={noop}
        phase={phase}
        speakerMuted={false}
        speakerVolume={1}
      />,
    );

    const microphone = screen.getByRole<HTMLButtonElement>("button", {
      name: "Mute microphone",
    });
    expect(microphone.disabled).toBe(true);
    fireEvent.click(microphone);
    expect(setMicrophoneMuted).not.toHaveBeenCalled();
  },
);

test.each(["listening", "thinking", "speaking"] as const)(
  "keeps the direct microphone action functional while Voice is %s",
  (phase) => {
    const setMicrophoneMuted = vi.fn();
    render(
      <VoiceDock
        actions={{
          end: vi.fn(),
          pause: noop,
          setMicrophoneMuted,
        }}
        assistantBusy={false}
        canReadFullResponse={false}
        canRepeatQuestion={false}
        canTakeTurn={false}
        collapsed={false}
        indicator={<span />}
        microphoneMuted={false}
        onCollapsedToggle={noop}
        onStop={noop}
        phase={phase}
        speakerMuted={false}
        speakerVolume={1}
      />,
    );

    const microphone = screen.getByRole<HTMLButtonElement>("button", {
      name: "Mute microphone",
    });
    expect(microphone.disabled).toBe(false);
    fireEvent.click(microphone);
    expect(setMicrophoneMuted).toHaveBeenCalledExactlyOnceWith(true);
  },
);

test.each(["connecting", "error"] as const)(
  "disables only speaker controls in Audio options while Voice is %s",
  async (phase) => {
    const setInterruptionBySpeaking = vi.fn();
    const setSpeakerMuted = vi.fn();
    const setSpeakerVolume = vi.fn();
    render(
      <VoiceDock
        actions={{
          end: vi.fn(),
          pause: noop,
          readFullResponse: vi.fn(),
          repeatQuestion: vi.fn(),
          setInterruptionBySpeaking,
          setSpeakerMuted,
          setSpeakerVolume,
        }}
        assistantBusy={false}
        canReadFullResponse={false}
        canRepeatQuestion={false}
        canTakeTurn={false}
        collapsed={false}
        indicator={<span />}
        interruptionBySpeaking
        microphoneMuted={false}
        onCollapsedToggle={noop}
        onStop={noop}
        phase={phase}
        speakerMuted={false}
        speakerVolume={1}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Audio options" }));
    const speakerMute = await screen.findByRole<HTMLButtonElement>("button", {
      name: "Mute speaker",
    });
    const volume = screen.getByRole("slider", { name: "Speaker volume" });
    expect(speakerMute.disabled).toBe(true);
    expect(volume.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(speakerMute);
    volume.focus();
    fireEvent.keyDown(volume, { key: "ArrowLeft" });
    expect(setSpeakerMuted).not.toHaveBeenCalled();
    expect(setSpeakerVolume).not.toHaveBeenCalled();

    const interruption = screen.getByRole<HTMLInputElement>("checkbox", {
      name: "Allow interruptions",
    });
    expect(interruption.disabled).toBe(false);
    fireEvent.click(interruption);
    await waitFor(() =>
      expect(setInterruptionBySpeaking).toHaveBeenCalledExactlyOnceWith(false),
    );
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Repeat question",
      }).disabled,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Read full reply",
      }).disabled,
    ).toBe(true);
  },
);

test.each(["listening", "thinking", "speaking", "paused"] as const)(
  "keeps speaker controls callable while Voice is %s",
  async (phase) => {
    const setSpeakerMuted = vi.fn();
    const setSpeakerVolume = vi.fn();
    render(
      <VoiceDock
        actions={{
          end: vi.fn(),
          pause: noop,
          setSpeakerMuted,
          setSpeakerVolume,
        }}
        assistantBusy={false}
        canReadFullResponse={false}
        canRepeatQuestion={false}
        canTakeTurn={false}
        collapsed={false}
        indicator={<span />}
        microphoneMuted={false}
        onCollapsedToggle={noop}
        onStop={noop}
        phase={phase}
        speakerMuted={false}
        speakerVolume={1}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Audio options" }));
    const speakerMute = await screen.findByRole<HTMLButtonElement>("button", {
      name: "Mute speaker",
    });
    const volume = screen.getByRole("slider", { name: "Speaker volume" });
    expect(speakerMute.disabled).toBe(false);
    expect(volume.getAttribute("aria-disabled")).not.toBe("true");
    fireEvent.click(speakerMute);
    volume.focus();
    fireEvent.keyDown(volume, { key: "ArrowLeft" });
    expect(setSpeakerMuted).toHaveBeenCalledExactlyOnceWith(true);
    await waitFor(() =>
      expect(setSpeakerVolume).toHaveBeenCalledExactlyOnceWith(0.95),
    );
  },
);

test("shows the speed slider immediately with fine keyboard steps", async () => {
  const setSpeed = vi.fn();
  render(
    <VoiceDock
      actions={{
        audioSettings: {
          refreshDevices: vi.fn(),
          requestSpeaker: vi.fn(),
          setMicrophoneDevice: vi.fn(),
          setSpeakerDevice: vi.fn(),
          setSpeed,
          setVoice: vi.fn(),
        },
        end: vi.fn(),
        pause: noop,
      }}
      audioSettings={{
        activeVoice: "alloy",
        voice: "alloy",
        voices: [{ value: "alloy", text: "Alloy" }],
        speed: 1,
        devices: {
          microphones: [],
          speakers: [],
          microphoneId: "",
          speakerId: "",
          canSelectSpeaker: false,
          canRequestSpeaker: false,
          busy: false,
          message: null,
        },
      }}
      assistantBusy={false}
      canReadFullResponse={false}
      canRepeatQuestion={false}
      canTakeTurn={false}
      collapsed={false}
      indicator={<span />}
      microphoneMuted={false}
      onCollapsedToggle={noop}
      onStop={noop}
      phase="connected"
      speakerMuted={false}
      speakerVolume={1}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Audio options" }));
  const speed = await screen.findByRole("slider", { name: "Speed" });
  expect(speed.getAttribute("aria-valuemin")).toBe("0.25");
  expect(speed.getAttribute("aria-valuemax")).toBe("1.5");
  expect(speed.getAttribute("aria-valuenow")).toBe("1");
  expect(screen.getByText("1.00×")).not.toBeNull();
  expect(screen.queryByText("Next reply")).toBeNull();

  speed.focus();
  fireEvent.keyDown(speed, { key: "ArrowRight" });
  await waitFor(() => expect(setSpeed).toHaveBeenCalledExactlyOnceWith(1.05));
});

test("keeps voice visible while toggling devices and refreshes devices when opened", async () => {
  const refreshDevices = vi.fn();
  const stopVoicePreview = vi.fn();
  const setVoice = vi.fn();
  render(
    <VoiceDock
      actions={{
        audioSettings: {
          refreshDevices,
          stopVoicePreview,
          requestSpeaker: vi.fn(),
          setMicrophoneDevice: vi.fn(),
          setSpeakerDevice: vi.fn(),
          setVoice,
        },
        end: vi.fn(),
        pause: noop,
        setSpeakerVolume: vi.fn(),
      }}
      audioSettings={{
        activeVoice: "alloy",
        voice: "verse",
        voicePreview: "playing",
        voices: [
          { value: "alloy", text: "Alloy" },
          { value: "verse", text: "Verse" },
        ],
        devices: {
          microphones: [],
          speakers: [],
          microphoneId: "",
          speakerId: "",
          canSelectSpeaker: false,
          canRequestSpeaker: false,
          busy: false,
          message: "Allow microphone access to list devices.",
        },
      }}
      assistantBusy={false}
      canReadFullResponse={false}
      canRepeatQuestion={false}
      canTakeTurn={false}
      collapsed={false}
      indicator={<span />}
      microphoneMuted={true}
      onCollapsedToggle={noop}
      onStop={noop}
      phase="connected"
      speakerMuted={false}
      speakerVolume={0.65}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Audio options" }));
  expect(
    (
      await screen.findByRole("slider", { name: "Speaker volume" })
    ).getAttribute("aria-valuenow"),
  ).toBe("65");
  expect(screen.getByRole("combobox", { name: "Voice" })).not.toBeNull();
  expect(screen.getByText("Voice preview playing").getAttribute("role")).toBe(
    "status",
  );
  expect(
    screen.queryByRole("button", { name: /play preview|pause preview/i }),
  ).toBeNull();
  const nativeVoice = document.querySelector("select");
  if (!nativeVoice) throw new Error("Missing native voice field");
  fireEvent.change(nativeVoice, { target: { value: "alloy" } });
  await waitFor(() =>
    expect(setVoice).toHaveBeenCalledExactlyOnceWith("alloy"),
  );
  expect(screen.queryByRole("button", { name: /^Voice/ })).toBeNull();
  const devicesToggle = screen.getByRole("button", { name: "Devices" });
  expect(devicesToggle.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("combobox", { name: "Microphone" })).toBeNull();
  expect(screen.queryByRole("combobox", { name: "Speaker" })).toBeNull();
  expect(screen.queryByText(/Applies next session/)).toBeNull();
  expect(
    screen.getByRole("button", { name: "About voice selection" }),
  ).toBeTruthy();
  expect(screen.getByRole("combobox", { name: "Voice" })).not.toBeNull();
  expect(
    screen.queryByText(
      "Speaking speed is not available with this voice provider.",
    ),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Real-time" })).toBeNull();
  expect(screen.queryByRole("slider", { name: "Speed" })).toBeNull();

  expect(refreshDevices).toHaveBeenCalledOnce();
  fireEvent.click(devicesToggle);
  expect(devicesToggle.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("combobox", { name: "Voice" })).not.toBeNull();
  expect(screen.getByRole("combobox", { name: "Microphone" }).textContent).toBe(
    "System default",
  );
  expect(screen.getByRole("combobox", { name: "Speaker" }).textContent).toBe(
    "System default",
  );
  expect(
    screen.getByRole<HTMLButtonElement>("combobox", { name: "Speaker" })
      .disabled,
  ).toBe(true);
  expect(
    screen.getByText("System default — change output in your system settings."),
  ).not.toBeNull();
  expect(
    screen
      .getByText("Allow microphone access to list devices.")
      .getAttribute("role"),
  ).toBe("status");
  expect(screen.queryByRole("button", { name: "Refresh devices" })).toBeNull();
  expect(
    screen.queryByText("Disconnected devices switch to system default."),
  ).toBeNull();
  fireEvent.click(devicesToggle);
  expect(devicesToggle.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("combobox", { name: "Microphone" })).toBeNull();
  expect(screen.queryByRole("combobox", { name: "Speaker" })).toBeNull();
  expect(screen.getByRole("combobox", { name: "Voice" })).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Audio options" }));
  expect(refreshDevices).toHaveBeenCalledOnce();
  expect(stopVoicePreview).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Audio options" }));
  expect(refreshDevices).toHaveBeenCalledTimes(2);
});

test("gates voice previews and hides only ordinary status text", async () => {
  const stopVoicePreview = vi.fn();
  const setMicrophoneMuted = vi.fn();
  const setVoice = vi.fn();
  const dock = (
    phase: "listening" | "speaking" | "muted" | "connecting",
    microphoneMuted: boolean,
  ) => (
    <VoiceDock
      actions={{
        audioSettings: {
          refreshDevices: vi.fn(),
          stopVoicePreview,
          requestSpeaker: vi.fn(),
          setMicrophoneDevice: vi.fn(),
          setSpeakerDevice: vi.fn(),
          setVoice,
        },
        end: noop,
        pause: noop,
        setSpeakerVolume: noop,
        setMicrophoneMuted,
      }}
      audioSettings={{
        activeVoice: "alloy",
        voice: "alloy",
        voices: [
          { value: "alloy", text: "Alloy" },
          { value: "verse", text: "Verse" },
        ],
        devices: {
          microphones: [],
          speakers: [],
          microphoneId: "",
          speakerId: "",
          canSelectSpeaker: false,
          canRequestSpeaker: false,
          busy: false,
          message: null,
        },
      }}
      assistantBusy={false}
      canReadFullResponse={false}
      canRepeatQuestion={false}
      canTakeTurn={false}
      collapsed={false}
      indicator={<span data-testid="waveform" />}
      microphoneMuted={microphoneMuted}
      onCollapsedToggle={noop}
      onStop={noop}
      phase={phase}
      speakerMuted={false}
      speakerVolume={1}
    />
  );
  const { rerender } = render(dock("listening", false));
  fireEvent.click(screen.getByRole("button", { name: "Audio options" }));
  const voice = await screen.findByRole<HTMLButtonElement>("combobox", {
    name: "Voice",
  });
  expect(voice.disabled).toBe(false);
  const nativeVoice = document.querySelector("select");
  if (!nativeVoice) throw new Error("Missing native voice field");
  fireEvent.change(nativeVoice, { target: { value: "verse" } });
  await waitFor(() =>
    expect(setVoice).toHaveBeenCalledExactlyOnceWith("verse"),
  );
  expect(screen.queryByText("Mute your mic to preview.")).toBeNull();
  expect(voice.getAttribute("aria-description")).toContain(
    "Mute your mic to preview.",
  );
  const toggle = screen.getByRole("checkbox", { name: "Show status text" });
  expect((toggle as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByText("Show status text"));
  await waitFor(() =>
    expect(screen.queryByText("Listening", { exact: true })).toBeNull(),
  );
  expect(screen.getByRole("status", { name: "Voice status" }).textContent).toBe(
    "Voice status: Listening",
  );
  expect(screen.getByTestId("waveform")).not.toBeNull();

  rerender(dock("speaking", true));
  expect(voice.disabled).toBe(false);
  expect(screen.queryByText("Wait for the agent to finish.")).toBeNull();
  expect(voice.getAttribute("aria-description")).toContain(
    "Wait for the agent to finish.",
  );
  expect(screen.queryByText("Speaking", { exact: true })).toBeNull();
  rerender(dock("muted", true));
  expect(voice.disabled).toBe(false);
  expect(screen.getByText("Muted", { exact: true })).not.toBeNull();
  stopVoicePreview.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Unmute microphone" }));
  expect(stopVoicePreview).toHaveBeenCalledOnce();
  expect(setMicrophoneMuted).toHaveBeenCalledExactlyOnceWith(false);
  expect(stopVoicePreview.mock.invocationCallOrder[0]).toBeLessThan(
    setMicrophoneMuted.mock.invocationCallOrder[0]!,
  );

  rerender(dock("connecting", true));
  expect(voice.disabled).toBe(false);
  setVoice.mockClear();
  fireEvent.change(nativeVoice, { target: { value: "verse" } });
  await waitFor(() =>
    expect(setVoice).toHaveBeenCalledExactlyOnceWith("verse"),
  );
  expect(screen.getByText("Connecting", { exact: true })).not.toBeNull();
});
