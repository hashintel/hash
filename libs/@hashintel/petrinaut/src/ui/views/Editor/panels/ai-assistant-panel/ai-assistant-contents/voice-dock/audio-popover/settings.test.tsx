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
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

import { AudioSettings } from "./settings";

const noop = () => {};

beforeAll(() => {
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

test("keeps speed visible in Voice settings and changes it in 0.05 steps", async () => {
  const setSpeed = vi.fn();
  render(
    <AudioSettings
      actions={{
        refreshDevices: noop,
        requestSpeaker: noop,
        setMicrophoneDevice: noop,
        setSpeakerDevice: noop,
        setSpeed,
        setVoice: noop,
      }}
      disabled={false}
      previewDisabledReason={null}
      settings={{
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
    />,
  );
  expect(screen.queryByRole("button", { name: "Real-time" })).toBeNull();
  const speed = screen.getByRole("slider", { name: "Speed" });
  expect(speed.getAttribute("aria-valuenow")).toBe("1");
  speed.focus();
  fireEvent.keyDown(speed, { key: "ArrowRight" });
  await waitFor(() => expect(setSpeed).toHaveBeenCalledExactlyOnceWith(1.05));
});

test("keeps voice guidance in a dismissible information popover", async () => {
  render(
    <AudioSettings
      actions={{
        refreshDevices: noop,
        requestSpeaker: noop,
        setMicrophoneDevice: noop,
        setSpeakerDevice: noop,
        setVoice: noop,
      }}
      disabled={false}
      previewDisabledReason="Mute your mic to preview."
      settings={{
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
      }}
    />,
  );
  expect(screen.queryByText(/Applies next session/)).toBeNull();
  expect(screen.queryByText("Mute your mic to preview.")).toBeNull();
  expect(
    screen
      .getByRole("combobox", { name: "Voice" })
      .getAttribute("aria-description"),
  ).toContain("Mute your mic to preview.");
  const info = screen.getByRole("button", { name: "About voice selection" });
  fireEvent.click(info);
  expect(
    await screen.findByText(
      "Applies next session. Mute your mic while the agent is idle to preview.",
    ),
  ).toBeTruthy();
  const dialog = await screen.findByRole("dialog");
  await waitFor(() => expect(document.activeElement).toBe(dialog));
  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("summarizes selected audio devices without exposing device IDs", () => {
  const actions = {
    refreshDevices: noop,
    requestSpeaker: noop,
    setMicrophoneDevice: noop,
    setSpeakerDevice: noop,
    setVoice: noop,
  };
  const settings = {
    activeVoice: "alloy",
    voice: "alloy",
    voices: [{ value: "alloy", text: "Alloy" }],
    devices: {
      microphones: [{ value: "mic-1", text: "Desk microphone" }],
      speakers: [{ value: "speaker-1", text: "Headphones" }],
      microphoneId: "mic-1",
      speakerId: "speaker-1",
      canSelectSpeaker: true,
      canRequestSpeaker: false,
      busy: false,
      message: null,
    },
  };
  const { rerender } = render(
    <AudioSettings
      actions={actions}
      disabled={false}
      previewDisabledReason={null}
      settings={settings}
    />,
  );
  expect(screen.getByRole("button", { name: "Devices" }).textContent).toContain(
    "Desk microphone · Headphones",
  );
  expect(screen.queryByRole("combobox", { name: "Microphone" })).toBeNull();
  rerender(
    <AudioSettings
      actions={actions}
      disabled={false}
      previewDisabledReason={null}
      settings={{
        ...settings,
        devices: {
          ...settings.devices,
          microphoneId: "",
          speakerId: "disconnected-private-id",
        },
      }}
    />,
  );
  expect(screen.getByRole("button", { name: "Devices" }).textContent).toContain(
    "System default · Unavailable speaker",
  );
  expect(screen.queryByText(/disconnected-private-id/u)).toBeNull();
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
