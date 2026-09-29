import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, expect, test, vi } from "vitest";

import { voiceNames } from "../../../../shared/voice-settings";
import { previewVoice } from "./preview";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const setup = () => {
  vi.useFakeTimers();
  const audio = Object.assign(new EventTarget(), {
    src: "",
    muted: false,
    volume: 1,
    setSinkId: vi.fn(async (_id: string) => {}),
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    removeAttribute: vi.fn((name: string) => {
      if (name === "src") audio.src = "";
    }),
  });
  vi.stubGlobal("Audio", function MockAudio(source?: string) {
    audio.src = source ?? "";
    return audio;
  });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const output = { muted: false, volume: 0.35, sinkId: "headphones" };
  const onState = vi.fn();
  const options = {
    provider: "realtime" as const,
    voice: "cedar",
    output: () => output,
    onState,
  };
  return {
    audio,
    fetch,
    output,
    onState,
    options,
  };
};

test.each(["live", "realtime"] as const)(
  "loads the exact %s voice from a versioned static asset",
  async (provider) => {
    const harness = setup();
    const stop = previewVoice({
      ...harness.options,
      provider,
      voice: provider === "live" ? "quartz" : "cedar",
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.audio.src).toBe(
      `/voice-previews/v1/${provider}/${
        provider === "live" ? "quartz" : "cedar"
      }.mp3`,
    );
    expect(harness.audio.play).toHaveBeenCalledOnce();
    expect(harness.fetch).not.toHaveBeenCalled();
    expect(harness.onState.mock.calls).toEqual([["loading"], ["playing"]]);
    stop();
    expect(harness.audio.pause).toHaveBeenCalledOnce();
    expect(harness.audio.removeAttribute).toHaveBeenCalledWith("src");
    expect(harness.onState).toHaveBeenLastCalledWith(null, undefined);
  },
);

test("follows mute, volume, and speaker changes while the sample plays", async () => {
  const harness = setup();
  previewVoice(harness.options);
  await vi.advanceTimersByTimeAsync(0);
  expect(harness.audio).toMatchObject({ muted: false, volume: 0.35 });
  expect(harness.audio.setSinkId).toHaveBeenLastCalledWith("headphones");
  expect(harness.onState).toHaveBeenLastCalledWith("playing");
  harness.output.muted = true;
  harness.output.volume = 0.7;
  harness.output.sinkId = "";
  await vi.advanceTimersByTimeAsync(100);
  expect(harness.audio).toMatchObject({ muted: true, volume: 0.7 });
  expect(harness.audio.setSinkId).toHaveBeenLastCalledWith("");
  expect(harness.onState).toHaveBeenLastCalledWith(null);
  harness.output.muted = false;
  await vi.advanceTimersByTimeAsync(100);
  expect(harness.onState).toHaveBeenLastCalledWith("playing");
  harness.audio.dispatchEvent(new Event("ended"));
  expect(harness.audio.pause).toHaveBeenCalledOnce();
  expect(harness.onState).toHaveBeenLastCalledWith(null, undefined);
});

test("stopping during loading ignores late playback", async () => {
  const harness = setup();
  const pending = Promise.withResolvers<void>();
  harness.audio.play.mockReturnValue(pending.promise);
  const stop = previewVoice(harness.options);
  await vi.advanceTimersByTimeAsync(0);
  stop();
  pending.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(harness.audio.play).toHaveBeenCalledOnce();
  expect(harness.onState.mock.calls).toEqual([["loading"], [null, undefined]]);
});

test("bounds stalled previews", async () => {
  const harness = setup();
  harness.audio.play.mockReturnValue(new Promise(() => {}));
  previewVoice(harness.options);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(harness.onState).toHaveBeenLastCalledWith(
    null,
    expect.stringContaining("timed out"),
  );
  expect(harness.audio.pause).toHaveBeenCalledOnce();
});

test("releases a sample when playback is denied", async () => {
  const harness = setup();
  harness.audio.play.mockRejectedValue(
    new DOMException("Blocked", "NotAllowedError"),
  );
  previewVoice(harness.options);
  await vi.advanceTimersByTimeAsync(0);
  expect(harness.onState).toHaveBeenLastCalledWith(
    null,
    expect.stringContaining("Preview unavailable"),
  );
  expect(harness.audio.pause).toHaveBeenCalledOnce();
});

test("has a static preview asset for every supported provider voice", () => {
  const assetRoot = fileURLToPath(
    new URL("../../../../../public/voice-previews/v1", import.meta.url),
  );
  for (const [provider, voices] of Object.entries(voiceNames)) {
    for (const voice of voices) {
      const asset = join(assetRoot, provider, `${voice}.mp3`);
      expect(existsSync(asset), asset).toBe(true);
    }
  }
});
