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
import { createElement, use, useEffect, useState } from "react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "@hashintel/petrinaut-core";

import {
  NotificationsContext,
  type NotificationsContextValue,
} from "../../../../../react/notifications/context";
import { NotificationsProvider } from "../../../../../react/notifications/provider";
import { EditorContext } from "../../../../../react/state/editor-context";
import { VoiceSessionContext } from "../../../../../react/voice-session/context";
import { createVoiceSessionStore } from "../../../../../react/voice-session/store";
import { definePetrinautAiInteractiveTool } from "../../../../types/ai-interactive-tool";
import { AiAssistantContents } from "./ai-assistant-contents";
import { VoiceDock } from "./ai-assistant-contents/voice-dock";
import { AudioSettings } from "./ai-assistant-contents/voice-dock/audio-popover/settings";

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
const DockingHarness = ({
  onMount,
  onUnmount,
  onStop,
}: {
  onMount: () => void;
  onUnmount: () => void;
  onStop: () => void;
}) => {
  const editor = use(EditorContext);
  const [placement, setPlacement] = useState<"docked" | "floating">("docked");
  const [isOpen, setOpen] = useState(true);
  const [input, setInput] = useState("");
  return (
    <EditorContext
      value={{
        ...editor,
        aiAssistantPlacement: placement,
        setAiAssistantPlacement: setPlacement,
      }}
    >
      <button type="button" onClick={() => setOpen(true)}>
        Reopen assistant
      </button>
      <AiAssistantContents
        additionalTab={{
          label: "Workpiece",
          content: <p>Saved model account</p>,
        }}
        composerControl={
          <HostControl onMount={onMount} onUnmount={onUnmount} />
        }
        input={input}
        isOpen={isOpen}
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
        onClose={() => setOpen(false)}
        onInputChange={setInput}
        onStop={onStop}
        onSubmit={noop}
        status="streaming"
      />
    </EditorContext>
  );
};

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
      notice="Audio playback is blocked. Select Play voice audio to hear Live."
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
  expect(indicator.className).toContain("flex-sh_0");
  expect(status.className).toContain("ov_hidden");
  expect(status.className).toContain("tov_ellipsis");
  expect(within(indicator).getByTestId("waveform")).toBeTruthy();
  expect(liveStatus.textContent).toBe(
    "Voice status: Audio playback is blocked. Select Play voice audio to hear Live.",
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
    notice: "Audio playback is blocked. Select Play voice audio to hear Live.",
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

test("collapses Real-time speed settings until expanded", async () => {
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
  const realTime = await screen.findByRole("button", { name: "Real-time" });
  expect(realTime.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("slider", { name: "Speed" })).toBeNull();

  fireEvent.click(realTime);
  expect(realTime.getAttribute("aria-expanded")).toBe("true");
  const speed = screen.getByRole("slider", { name: "Speed" });
  expect(speed.getAttribute("aria-valuemin")).toBe("0.25");
  expect(speed.getAttribute("aria-valuemax")).toBe("1.5");
  expect(speed.getAttribute("aria-valuenow")).toBe("1");
  expect(screen.getByText("1×")).not.toBeNull();
  expect(screen.queryByText("Next reply")).toBeNull();

  speed.focus();
  fireEvent.keyDown(speed, { key: "ArrowRight" });
  await waitFor(() => expect(setSpeed).toHaveBeenCalledExactlyOnceWith(1.25));
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
  expect(screen.queryByText(/^The voice applies next time/)).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "About voice selection" }),
  );
  const voiceInfo = await screen.findByText(/^The voice applies next time/);
  expect(voiceInfo.textContent).toBe(
    "The voice applies next time the agent is connected.Preview when your mic is muted and the agent is idle.",
  );
  expect(voiceInfo.querySelector("br")).not.toBeNull();
  await waitFor(() =>
    expect(
      screen
        .getByText(/^The voice applies next time/)
        .closest('[data-part="content"]')
        ?.getAttribute("data-state"),
    ).toBe("open"),
  );
  // Ark installs the nested dismissable layer on the next animation frame.
  await act(
    async () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  fireEvent.keyDown(screen.getByText(/^The voice applies next time/), {
    key: "Escape",
  });
  await waitFor(() =>
    expect(screen.queryByText(/^The voice applies next time/)).toBeNull(),
  );
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

test("stops a voice preview only when audio settings unmount", () => {
  const initialStopVoicePreview = vi.fn();
  const latestStopVoicePreview = vi.fn();
  const actions = {
    refreshDevices: vi.fn(),
    requestSpeaker: vi.fn(),
    setMicrophoneDevice: vi.fn(),
    setSpeakerDevice: vi.fn(),
    setVoice: vi.fn(),
  };
  const settings = {
    activeVoice: "alloy",
    voice: "alloy",
    voices: [{ value: "alloy", text: "Alloy" }],
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
  };
  const { rerender, unmount } = render(
    <AudioSettings
      actions={{
        ...actions,
        stopVoicePreview: initialStopVoicePreview,
      }}
      disabled={false}
      previewDisabledReason={null}
      settings={settings}
    />,
  );

  rerender(
    <AudioSettings
      actions={{
        ...actions,
        stopVoicePreview: latestStopVoicePreview,
      }}
      disabled={false}
      previewDisabledReason={null}
      settings={settings}
    />,
  );

  expect(initialStopVoicePreview).not.toHaveBeenCalled();
  expect(latestStopVoicePreview).not.toHaveBeenCalled();

  unmount();
  expect(initialStopVoicePreview).not.toHaveBeenCalled();
  expect(latestStopVoicePreview).toHaveBeenCalledOnce();
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
  expect(screen.getByText("Mute your mic to preview.")).not.toBeNull();
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
  expect(screen.getByText("Wait for the agent to finish.")).not.toBeNull();
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

describe("AiAssistantContents", () => {
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
      <AiAssistantContents
        input=""
        inputMode="voice"
        interactiveTools={[card]}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
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
      /Sent to Brunch[\s\S]*I’ll ask Brunch\.[\s\S]*Activity[\s\S]*Written answer[\s\S]*Experiment draft[\s\S]*Your draft is ready\./u,
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
    const brief = screen.getByText("Sent to Brunch").closest("details");
    expect(brief?.open).toBe(false);
    fireEvent.click(screen.getByText("Sent to Brunch"));
    expect(screen.getByText("Arrival rate")).not.toBeNull();
    expect(screen.queryByTestId("voice-input-provenance")).toBeNull();
    rerender(
      <AiAssistantContents
        input=""
        inputMode="voice"
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
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
    expect(screen.queryByText("Sent to Brunch")).toBeNull();
    expect(screen.queryByText("I’ll ask Brunch.")).toBeNull();
    await expandWork();
    expect(screen.getByText("Plain reply")).not.toBeNull();
  });

  test("stopped work counts tools and exposes status dots, arguments and results", async () => {
    render(
      <AiAssistantContents
        input=""
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
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

  test("opens running tools, then settles work while the answer streams", async () => {
    const props = {
      input: "",
      onClose: noop,
      onInputChange: noop,
      onStop: noop,
      onSubmit: noop,
      status: "streaming" as const,
    };
    const tool = {
      type: "dynamic-tool" as const,
      toolName: "read",
      toolCallId: "read-1",
      input: {},
    };
    const { rerender } = render(
      <AiAssistantContents
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
      <AiAssistantContents
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
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: /^Activity/u })
          .getAttribute("aria-expanded"),
      ).toBe("false"),
    );
    expect(
      screen.getByText("The model has").closest("[data-work-status]"),
    ).toBeNull();
    rerender(
      <AiAssistantContents
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
      <AiAssistantContents
        input=""
        inputMode="voice"
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
    expect(bubble?.contains(screen.getByText("Sent to Brunch"))).toBe(false);
  });

  test("copies an answer and retries its own user prompt rather than the latest prompt", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const onRetryPrompt = vi.fn();
    render(
      <AiAssistantContents
        input="Unsent draft"
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        onRetryPrompt={onRetryPrompt}
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
      <AiAssistantContents
        input=""
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        onRetryPrompt={vi.fn()}
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
      <AiAssistantContents
        additionalTab={{
          label: "Workpiece",
          content: <HostContent onMount={contentMounted} />,
        }}
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
      />,
    );
    const transcript = screen.getByRole("tabpanel", { name: "Chat" });
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
    fireEvent.click(screen.getByRole("tab", { name: "Chat" }));
    expect(screen.getByRole("tabpanel", { name: "Chat" })).toBe(transcript);
    expect(contentMounted).toHaveBeenCalledOnce();
  });

  test("keeps tab names stable and one live region mounted across announcements", () => {
    const props = {
      additionalTab: { label: "Ledger", content: <p>Saved account</p> },
      hostAttentionCount: 2,
      input: "",
      messages: [],
      onClose: noop,
      onInputChange: noop,
      onStop: noop,
      onSubmit: noop,
      primaryAttention: true,
      primaryLabel: "Chat",
      status: "ready" as const,
    };
    const { rerender } = render(
      <AiAssistantContents
        {...props}
        attentionAnnouncement="2 unseen Ledger updates"
      />,
    );

    expect(screen.getByRole("tab", { name: "Chat" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Ledger" })).not.toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe(
      "2 unseen Ledger updates",
    );

    rerender(<AiAssistantContents {...props} attentionAnnouncement="" />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("");
    rerender(
      <AiAssistantContents
        {...props}
        attentionAnnouncement="2 unseen Ledger updates"
      />,
    );
    expect(screen.getByRole("status").textContent).toBe(
      "2 unseen Ledger updates",
    );
  });

  test("returns to chat when the host withdraws its additional tab", () => {
    const props = {
      input: "",
      status: "ready" as const,
      messages: [],
      onClose: noop,
      onInputChange: noop,
      onStop: noop,
      onSubmit: noop,
    };
    const { rerender } = render(
      <AiAssistantContents
        {...props}
        additionalTab={{ label: "Notes", content: <p>Host notes</p> }}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Notes" }));
    rerender(<AiAssistantContents {...props} />);
    expect(screen.queryByRole("tab", { name: "Notes" })).toBeNull();
    expect(screen.getByTestId("ai-transcript").hidden).toBe(false);
  });

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
        <AiAssistantContents
          input=""
          status="ready"
          onClose={noop}
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
      await expandWork();
      const row = screen.getByRole("button", { name: /Not applied/u });
      expect(row.getAttribute("data-tone")).toBe("neutral");
      expect(within(row).getByText(output.reason)).not.toBeNull();
      expect(
        within(row).queryByText("Updated arc weight", { exact: true }),
      ).toBeNull();
      expect(row.querySelector('[data-tool-status="ok"]')).not.toBeNull();
      expect(
        row.querySelector('[data-tool-result-icon="complete"]'),
      ).toBeNull();
    },
  );

  test.each(["output-available", "output-error"] as const)(
    "preserves %s applied/error presentation",
    async (state) => {
      render(
        <AiAssistantContents
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
        <AiAssistantContents {...props} composerFocusRequest={0} />
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Message AI assistant" });
    expect(document.activeElement).toBe(input);
    screen.getByRole("textbox", { name: "Other input" }).focus();
    rerender(
      <>
        <input aria-label="Other input" />
        <AiAssistantContents {...props} composerFocusRequest={1} />
      </>,
    );
    expect(document.activeElement).toBe(input);
    expect((input as HTMLTextAreaElement).value).toBe("Keep this draft");
    rerender(
      <>
        <input aria-label="Other input" />
        <AiAssistantContents
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
    render(
      <NotificationsProvider>
        <DockingHarness onMount={mount} onUnmount={unmount} onStop={stop} />
      </NotificationsProvider>,
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
    expect(transcript.hidden).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: "Chat" }));
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
      <NotificationsProvider>
        <AiAssistantContents
          input=""
          status="ready"
          stopped={false}
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
        />
      </NotificationsProvider>,
    );
    expect(screen.getByText("Partial reply")).not.toBeNull();
    expect(screen.getByText("Later completed reply")).not.toBeNull();
    expect(screen.getAllByText("Stopped")).toHaveLength(1);
  });

  test("keeps non-Voice assistant errors in global notifications", () => {
    const message =
      'Elicitor failed.\nCaused by: {"field":"answer","reason":"Required"}';
    const addNotification = vi.fn(() => "notification-id");
    render(
      <NotificationsContext
        value={{ addNotification, dismissNotification: vi.fn() }}
      >
        <AiAssistantContents
          error={new Error(message)}
          input=""
          messages={[]}
          onClose={noop}
          onInputChange={noop}
          onStop={noop}
          onSubmit={noop}
          status="error"
        />
      </NotificationsContext>,
    );

    expect(addNotification).toHaveBeenCalledOnce();
    expect(addNotification).toHaveBeenCalledWith({
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
      additionalTab: { label: "Notes", content: <p>Saved notes</p> },
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
    fireEvent.click(screen.getByRole("tab", { name: "Notes" }));
    expect(screen.getByTestId("ai-voice-mode")).toBe(voiceSlot);
    expect(screen.getByText("Voice mode")).not.toBeNull();
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
          <AiAssistantContents
            input=""
            inputMode={inputMode}
            messages={messages}
            onClose={noop}
            onCollapsedVoiceEnd={onCollapsedVoiceEnd}
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
    expect(transcript.className).toContain("d_none");
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

    expect(transcript.className).not.toContain("d_none");
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
    expect(within(setupDock).queryByText(/connecting/i)).toBeNull();
    expect(within(setupDock).getByText("Voice setup")).not.toBeNull();
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
        <AiAssistantContents
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
    for (const label of [
      "Mute microphone",
      "Stop AI response",
      "End voice mode",
    ]) {
      const button = within(dock).getByRole("button", { name: label });
      const icon = button.querySelector("svg");
      expect(icon?.getAttribute("viewBox")).toBe(
        label === "Stop AI response" ? "0 0 24 24" : "0 0 20 20",
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
        notice: "We didn't catch that. Please try again.",
        phase: "listening",
      });
    });
    expect(
      within(dock).getByRole("status", { name: "Voice status" }).textContent,
    ).toBe("Voice status: We didn't catch that. Please try again.");
    expect(
      within(dock).getByText("We didn't catch that. Please try again."),
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
        <AiAssistantContents {...props} status="ready" />
      </VoiceSessionContext.Provider>,
    );

    expect(
      screen.queryByRole("button", { name: "Stop AI response" }),
    ).toBeNull();

    rendered.rerender(
      <VoiceSessionContext.Provider value={store}>
        <AiAssistantContents {...props} status="submitted" />
      </VoiceSessionContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Stop AI response" }));
    expect(onStop).toHaveBeenCalledOnce();
    expect(end).not.toHaveBeenCalled();

    rendered.rerender(
      <VoiceSessionContext.Provider value={store}>
        <AiAssistantContents {...props} status="streaming" />
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
        <AiAssistantContents {...props} status="error" />
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
    "Voice admission could not be confirmed. Check canonical history before sending again; no automatic retry was made.",
    "That utterance was not retained. Wait for the pending input, then use the composer to send it.",
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
        <NotificationsProvider>
          <VoiceSessionContext.Provider value={store}>
            <AiAssistantContents
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
          </VoiceSessionContext.Provider>
        </NotificationsProvider>,
      );
      const dock = screen.getByTestId("ai-voice-dock");
      expect(
        within(dock)
          .getAllByRole("button")
          .slice(0, 3)
          .map((button) => button.getAttribute("aria-label")),
      ).toEqual(["Show conversation", "Audio options", "Show 1 Voice issue"]);
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
      expect(await screen.findByText(warningMessage)).toBeTruthy();
      expect(within(dock).queryByText(warningMessage)).toBeNull();
      expect(
        screen.getByText(warningMessage).closest('[data-scope="toast"]'),
      ).toBeNull();
      act(() => {
        store.setState({ ...state, phase: "thinking", microphoneLevel: 0.5 });
      });
      expect(screen.getAllByText(warningMessage)).toHaveLength(1);
      act(() => {
        store.setState({ ...state, warningMessage: null });
      });
      expect(screen.getByText(warningMessage)).toBeTruthy();
      fireEvent.click(
        screen.getByRole("button", { name: "Dismiss Voice issues" }),
      );
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
            voiceDockCollapsed
          />
        </VoiceSessionContext.Provider>
      </NotificationsProvider>,
    );

    const dock = screen.getByTestId("ai-voice-dock");
    fireEvent.click(
      within(dock).getByRole("button", { name: "Show 1 Voice issue" }),
    );
    expect(
      await screen.findByText(
        "Microphone unavailable. Check your browser permissions.",
      ),
    ).toBeTruthy();
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

    expect(firstAddNotification).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Show 1 Voice issue" }),
    ).toBeTruthy();
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
    expect(secondAddNotification).not.toHaveBeenCalled();
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

    expect(screen.getByText("Voice")).not.toBeNull();
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
      <AiAssistantContents
        input=""
        inputMode={inputMode}
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
        ).queryByTestId("voice-input-provenance"),
      ).toBeNull();
    }
    expect(
      within(
        screen
          .getByText("question-typed: The operator")
          .closest("[data-tool-call-id]")!,
      ).queryByTestId("voice-input-provenance"),
    ).toBeNull();
    expect(screen.queryAllByTestId("voice-input-provenance")).toHaveLength(0);
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
    const { rerender } = render(
      <AiAssistantContents {...props} status="submitted" />,
    );

    expect(screen.getByRole("status").textContent).toContain(
      "Brunch is working",
    );

    rerender(<AiAssistantContents {...props} status="streaming" />);
    expect(screen.getByRole("status").textContent).toContain(
      "Brunch is working",
    );

    rerender(<AiAssistantContents {...props} status="ready" />);
    expect(screen.queryByText("Brunch is working")).toBeNull();
  });

  test("keeps the working label visible while the host tab is selected", () => {
    render(
      <AiAssistantContents
        additionalTab={{ label: "Ledger", content: <p>Saved account</p> }}
        hostTabSelected
        input=""
        messages={[]}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
        status="streaming"
        workingLabel="Brunch is working"
      />,
    );

    expect(screen.getByRole("tabpanel", { name: "Ledger" })).not.toBeNull();
    const status = screen.getByTestId("ai-working-status");
    expect(status.textContent).toContain("Brunch is working");
    expect(status.closest("[hidden]")).toBeNull();
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

    expect(scrollTo).toHaveBeenCalled();
    expect(scrollTo.mock.instances).toContain(
      screen.getByTestId("ai-transcript"),
    );
    window.HTMLElement.prototype.scrollTo = originalScrollTo;
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
      /Thought[\s\S]*I found the current places\./u,
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
      status: "streaming" as const,
    };
    const rendered = render(
      <AiAssistantContents
        {...props}
        messages={createMessages("input-streaming")}
      />,
    );

    expect(screen.getByText("Preparing…")).not.toBeNull();
    await expandWork();
    const pendingRow = screen.getByRole("button", { name: /Preparing/u });
    expect(within(pendingRow).queryByText(/Buffer/u)).toBeNull();
    expect(pendingRow.getAttribute("aria-busy")).toBe("true");
    expect(pendingRow.getAttribute("data-tone")).toBe("success");
    expect(
      pendingRow.querySelector('[data-tool-status="pending"]'),
    ).not.toBeNull();

    rendered.rerender(
      <AiAssistantContents
        {...props}
        messages={createMessages("input-available")}
      />,
    );

    expect(screen.queryByText("Preparing…")).toBeNull();
    expect(screen.getByText("Running…")).not.toBeNull();

    rendered.rerender(
      <AiAssistantContents
        {...props}
        messages={createMessages("output-available")}
      />,
    );

    expect(screen.queryByText("Running…")).toBeNull();
    const completedRow = screen.getByRole("button", {
      name: /Added place Buffer/u,
    });
    expect(completedRow.hasAttribute("aria-busy")).toBe(false);
    expect(
      completedRow.querySelector('[data-tool-status="ok"]'),
    ).not.toBeNull();
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
      <AiAssistantContents
        input=""
        messages={messages}
        onClose={noop}
        onInputChange={noop}
        onStop={noop}
        onSubmit={noop}
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

    await expandWork();
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
        .querySelector('[data-tool-status="ok"]'),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Correctable five/u }));
    expect(screen.getByText("Nothing changed")).not.toBeNull();
    expect(
      within(screen.getByText("Completed six").closest("button")!).getByTestId(
        "tool-detail",
      ).textContent,
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
        <AiAssistantContents
          input=""
          messages={messages}
          onClose={noop}
          onInputChange={noop}
          onStop={noop}
          onSubmit={noop}
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
    await expandWork();
    const pendingRow = screen.getByRole("button", { name: /Updating ledger/u });
    expect(pendingRow.getAttribute("data-tone")).toBe("pending");
    expect(
      pendingRow.querySelector('[data-tool-status="pending"]'),
    ).not.toBeNull();
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
    await expandWork();
    const appliedRow = screen.getByRole("button", { name: /Updated ledger/u });
    expect(appliedRow.getAttribute("data-tone")).toBe("success");
    expect(appliedRow.querySelector('[data-tool-status="ok"]')).not.toBeNull();
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
    await expandWork();
    const refusedRow = screen.getByRole("button", {
      name: /Ledger update needs correction/u,
    });
    expect(refusedRow.getAttribute("data-tone")).toBe("neutral");
    expect(refusedRow.querySelector('[data-tool-status="ok"]')).not.toBeNull();
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
    await expandWork();
    const thrownRow = screen.getByRole("button", {
      name: /Could not update ledger/u,
    });
    expect(thrownRow.getAttribute("data-tone")).toBe("danger");
    expect(
      thrownRow.querySelector('[data-tool-status="error"]'),
    ).not.toBeNull();
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
      <AiAssistantContents
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

    await expandWork();
    fireEvent.click(screen.getByRole("button", { name: /Deleted 3 items/u }));

    expect(screen.getByText("place: Old place")).not.toBeNull();
    expect(screen.getByText("transition: Old transition")).not.toBeNull();
    expect(screen.getByText("parameter: old_rate")).not.toBeNull();
  });
});
