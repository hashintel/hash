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
