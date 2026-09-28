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
import { afterEach, expect, test, vi } from "vitest";

import { VoiceDock } from "../voice-dock";
import { AudioSettings } from "./audio-popover/settings";

const noop = () => {};

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

test("shows permanent voice guidance without an information popover", () => {
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
      previewDisabledReason={null}
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

  expect(
    screen.getByText("Applies next session. Mute your mic to preview."),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "About voice selection" }),
  ).toBeNull();
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
  expect(dock.querySelector("[data-interrupted-ribbon]")).not.toBeNull();
  expect(dock.querySelector('[data-part="visible-status"]')).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("Voice interrupted");
  expect(
    screen.getByRole("button", { name: "Reconnect voice mode" }),
  ).toBeTruthy();
});
