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

import { VoiceDock } from "../voice-dock";
import { AudioSettings } from "./audio-popover/settings";

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
  expect(info.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(info);
  expect(
    await screen.findByText(
      "Applies next session. Mute your mic while the agent is idle to preview.",
    ),
  ).toBeTruthy();
  expect(info.getAttribute("aria-expanded")).toBe("true");
  const dialog = await screen.findByRole("dialog");
  await waitFor(() => expect(document.activeElement).toBe(dialog));
  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(info.getAttribute("aria-expanded")).toBe("false");
  });
});

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
