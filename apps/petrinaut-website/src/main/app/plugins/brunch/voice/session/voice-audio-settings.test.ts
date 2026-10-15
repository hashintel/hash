import { expect, test, vi } from "vitest";

import { VoiceAudioSettings } from "./voice-audio-settings";

import type { previewVoice } from "./voice-audio-settings/preview";

const capture = () => {
  const track = Object.assign(new EventTarget(), {
    enabled: true,
    readyState: "live",
    stop: vi.fn(() => {
      track.readyState = "ended";
    }),
  });
  const stream = {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
  return { stream, track };
};
const device = (kind: MediaDeviceKind, deviceId: string): MediaDeviceInfo => ({
  kind,
  deviceId,
  groupId: "",
  label: deviceId,
  toJSON: () => ({}),
});
const readyPreview = (settings: VoiceAudioSettings) => {
  const microphone = capture();
  microphone.track.enabled = false;
  settings.attach({
    stream: microphone.stream,
    audio: { muted: false, volume: 1 },
    senders: [],
    replaceMicrophone: vi.fn(),
  });
  settings.setPreviewAvailability({
    connected: true,
    microphoneMuted: true,
    busy: false,
  });
  return microphone;
};
const setup = () => {
  const initial = capture();
  const replacement = capture();
  const devices = Object.assign(new EventTarget(), {
    getUserMedia: vi.fn(async () => replacement.stream),
    enumerateDevices: vi.fn(async () => [
      device("audioinput", "usb-mic"),
      device("audiooutput", "headphones"),
    ]),
    selectAudioOutput: vi.fn(async () => device("audiooutput", "headphones")),
  });
  const audio = {
    setSinkId: vi.fn(async (_deviceId: string) => {}),
    muted: true,
    volume: 0.35,
  };
  const senders = [
    { replaceTrack: vi.fn(async (_track: MediaStreamTrack | null) => {}) },
    { replaceTrack: vi.fn(async (_track: MediaStreamTrack | null) => {}) },
  ] as const;
  const replaceMicrophone = vi.fn((stream: MediaStream) => {
    for (const track of stream.getAudioTracks()) track.enabled = false;
  });
  const settings = new VoiceAudioSettings("live", devices);
  const connection = {
    stream: initial.stream,
    audio,
    senders,
    replaceMicrophone,
  };
  const detach = settings.attach(connection);
  return {
    initial,
    replacement,
    devices,
    audio,
    senders,
    replaceMicrophone,
    settings,
    connection,
    detach,
  };
};

test("persists only valid provider voices and applies them at the next session", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const settings = new VoiceAudioSettings("realtime", undefined, storage);
  expect(settings.startSession()).toBe("marin");
  readyPreview(settings);
  settings.actions.setVoice("cedar");
  settings.actions.setVoice("quartz");
  expect(settings.getSnapshot()).toMatchObject({
    voice: "cedar",
    activeVoice: "marin",
  });
  expect(
    new VoiceAudioSettings("realtime", undefined, storage).startSession(),
  ).toBe("cedar");
  expect(
    new VoiceAudioSettings("live", undefined, storage).startSession(),
  ).toBe("marin");
  expect(settings.startSession()).toBe("cedar");
  settings.actions.setSpeed?.(1.25);
  settings.actions.setSpeed?.(2);
  expect(settings.getSnapshot().speed).toBe(1.25);
  settings.startSession();
  expect(settings.getSnapshot().speed).toBe(1);
  expect(
    new VoiceAudioSettings("live", undefined, storage).actions.setSpeed,
  ).toBeUndefined();
});

test("storage failure retains the selection in memory with an explanation", () => {
  const settings = new VoiceAudioSettings("live", undefined, {
    getItem: () => "not-a-voice",
    setItem: () => {
      throw new Error("blocked");
    },
  });
  expect(settings.getSnapshot().voice).toBe("marin");
  readyPreview(settings);
  settings.actions.setVoice("quartz");
  expect(settings.getSnapshot().voice).toBe("quartz");
  expect(settings.getSnapshot().voiceSaveError).toContain("could not be saved");
});

test("selection previews without changing the active voice, replaces samples, and stops on detach", () => {
  const stops: ReturnType<typeof vi.fn>[] = [];
  const preview = vi.fn((options: Parameters<typeof previewVoice>[0]) => {
    options.onState("loading");
    const stop = vi.fn(() => options.onState(null));
    stops.push(stop);
    return stop;
  });
  const settings = new VoiceAudioSettings(
    "live",
    undefined,
    {
      getItem: () => "quartz",
      setItem: vi.fn(),
    },
    preview,
  );
  settings.startSession();
  expect(preview).not.toHaveBeenCalled();
  const audio = { muted: true, volume: 0.35, sinkId: "headphones" };
  const microphone = capture();
  microphone.track.enabled = false;
  settings.attach({
    stream: microphone.stream,
    audio,
    senders: [],
    replaceMicrophone: vi.fn(),
  });
  settings.setPreviewAvailability({
    connected: true,
    microphoneMuted: true,
    busy: false,
  });
  settings.actions.setVoice("cedar");
  expect(preview).not.toHaveBeenCalled();
  settings.actions.setVoice("willow");
  expect(settings.getSnapshot()).toMatchObject({
    voice: "willow",
    activeVoice: "quartz",
    voicePreview: "loading",
  });
  preview.mock.calls[0]?.[0].onState("playing");
  expect(settings.getSnapshot().voicePreview).toBe("playing");
  settings.actions.setVoice("vesper");
  expect(stops[0]).toHaveBeenCalledOnce();
  expect(preview.mock.calls[1]?.[0]).toMatchObject({
    provider: "live",
    voice: "vesper",
  });
  preview.mock.calls[1]?.[0].onState(null, "Preview unavailable");
  expect(settings.getSnapshot()).toMatchObject({
    voice: "vesper",
    activeVoice: "quartz",
    voicePreviewError: "Preview unavailable",
  });
  expect(preview.mock.calls[1]?.[0].output()).toEqual({
    muted: true,
    volume: 0.35,
    sinkId: "headphones",
  });
  settings.detach();
  expect(stops[1]).toHaveBeenCalledOnce();
  settings.actions.setVoice("quartz");
  expect(preview).toHaveBeenCalledTimes(2);
  expect(settings.getSnapshot()).toMatchObject({
    voice: "quartz",
    voicePreview: null,
    voicePreviewError: null,
  });
});

test.each([
  { connected: false, microphoneMuted: true, busy: false },
  { connected: true, microphoneMuted: false, busy: false },
  { connected: true, microphoneMuted: true, busy: true },
])("saves voice changes without previewing when unsafe: %j", (availability) => {
  const stop = vi.fn();
  const preview = vi.fn(() => stop);
  const storage = { getItem: () => null, setItem: vi.fn() };
  const settings = new VoiceAudioSettings("live", undefined, storage, preview);
  readyPreview(settings);
  settings.actions.setVoice("quartz");
  expect(preview).toHaveBeenCalledOnce();
  settings.setPreviewAvailability(availability);
  expect(stop).toHaveBeenCalledOnce();
  settings.actions.setVoice("willow");
  expect(settings.getSnapshot()).toMatchObject({
    voice: "willow",
    activeVoice: "marin",
  });
  expect(preview).toHaveBeenCalledOnce();
  expect(storage.setItem).toHaveBeenLastCalledWith(
    "petrinaut:voice:live:v1",
    "willow",
  );
  expect(settings.startSession()).toBe("willow");
});

test.each([
  ["live", "quartz"],
  ["realtime", "cedar"],
] as const)(
  "saves %s voice before microphone capture exists",
  (provider, voice) => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const preview = vi.fn(() => vi.fn());
    const settings = new VoiceAudioSettings(
      provider,
      undefined,
      storage,
      preview,
    );
    settings.actions.setVoice(voice);
    expect(settings.getSnapshot()).toMatchObject({
      voice,
      activeVoice: "marin",
      voicePreview: null,
    });
    expect(preview).not.toHaveBeenCalled();
    expect(
      new VoiceAudioSettings(
        provider,
        undefined,
        storage,
        preview,
      ).startSession(),
    ).toBe(voice);
  },
);

test("checks the real capture track even if the published mute state is stale", () => {
  const preview = vi.fn(() => vi.fn());
  const settings = new VoiceAudioSettings(
    "live",
    undefined,
    undefined,
    preview,
  );
  const microphone = readyPreview(settings);
  microphone.track.enabled = true;
  settings.actions.setVoice("quartz");
  expect(preview).not.toHaveBeenCalled();
  expect(settings.getSnapshot().voice).toBe("quartz");
  microphone.track.enabled = false;
  microphone.track.readyState = "ended";
  settings.actions.setVoice("willow");
  expect(preview).not.toHaveBeenCalled();
  expect(settings.getSnapshot().voice).toBe("willow");
});

test("replaces both Live senders, reapplies mute, and leaves output untouched", async () => {
  const harness = setup();
  await harness.settings.setMicrophone("usb-mic");
  expect(harness.devices.getUserMedia).toHaveBeenCalledWith({
    audio: {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
      deviceId: { exact: "usb-mic" },
    },
  });
  harness.senders.forEach((sender) =>
    expect(sender.replaceTrack).toHaveBeenCalledWith(harness.replacement.track),
  );
  expect(harness.replaceMicrophone).toHaveBeenCalledWith(
    harness.replacement.stream,
  );
  expect(harness.replacement.track.enabled).toBe(false);
  expect(harness.initial.track.stop).toHaveBeenCalledOnce();
  expect(harness.audio).toMatchObject({ muted: true, volume: 0.35 });
  harness.detach();
});

test("rolls both senders back after a partial failure and stops the replacement", async () => {
  const harness = setup();
  harness.senders[1].replaceTrack.mockRejectedValueOnce(new Error("closed"));
  await harness.settings.setMicrophone("usb-mic");
  harness.senders.forEach((sender) =>
    expect(sender.replaceTrack).toHaveBeenLastCalledWith(harness.initial.track),
  );
  expect(harness.replaceMicrophone).not.toHaveBeenCalled();
  expect(harness.initial.track.stop).not.toHaveBeenCalled();
  expect(harness.replacement.track.stop).toHaveBeenCalledOnce();
  expect(harness.settings.getSnapshot().devices.microphoneId).toBe("");
  expect(harness.settings.getSnapshot().devices.message).toContain(
    "Could not switch microphone",
  );
  harness.detach();
});

test("stops late capture after detach without changing the next connection", async () => {
  const harness = setup();
  const pending = Promise.withResolvers<MediaStream>();
  harness.devices.getUserMedia.mockReturnValueOnce(pending.promise);
  const switching = harness.settings.setMicrophone("usb-mic");
  harness.detach();
  const next = capture();
  const detachNext = harness.settings.attach({
    ...harness.connection,
    stream: next.stream,
  });
  harness.detach(); // An old session's cleanup must not detach its successor.
  pending.resolve(harness.replacement.stream);
  await switching;
  expect(harness.replacement.track.stop).toHaveBeenCalledOnce();
  expect(harness.replaceMicrophone).not.toHaveBeenCalled();
  await harness.settings.setSpeaker("headphones");
  expect(harness.audio.setSinkId).toHaveBeenCalledWith("headphones");
  detachNext();
});

test("recovers both unplugged devices to default and does not switch back on reconnect", async () => {
  const harness = setup();
  await harness.settings.setMicrophone("usb-mic");
  await harness.settings.setSpeaker("headphones");
  const fallback = capture();
  harness.devices.getUserMedia.mockResolvedValue(fallback.stream);
  harness.devices.enumerateDevices.mockResolvedValue([
    device("audioinput", "built-in"),
  ]);
  harness.devices.dispatchEvent(new Event("devicechange"));
  await vi.waitFor(() =>
    expect(harness.settings.getSnapshot().devices).toMatchObject({
      microphoneId: "",
      speakerId: "",
      busy: false,
    }),
  );
  expect(harness.audio.setSinkId).toHaveBeenLastCalledWith("");
  expect(fallback.track.enabled).toBe(false);
  expect(harness.audio).toMatchObject({ muted: true, volume: 0.35 });
  harness.devices.enumerateDevices.mockResolvedValue([
    device("audioinput", "usb-mic"),
    device("audiooutput", "headphones"),
  ]);
  await harness.settings.refresh(true);
  expect(harness.devices.getUserMedia).toHaveBeenCalledTimes(2);
  expect(harness.settings.getSnapshot().devices.speakerId).toBe("");
  harness.detach();
});

test("reacquires a selected microphone when its track ends but the device remains", async () => {
  const harness = setup();
  await harness.settings.setMicrophone("usb-mic");
  const recovered = capture();
  harness.devices.getUserMedia.mockResolvedValueOnce(recovered.stream);
  harness.replacement.track.readyState = "ended";

  await harness.settings.refresh(true);

  expect(harness.devices.getUserMedia).toHaveBeenLastCalledWith({
    audio: {
      autoGainControl: true,
      deviceId: { exact: "usb-mic" },
      echoCancellation: true,
      noiseSuppression: true,
    },
  });
  expect(harness.settings.getSnapshot().devices).toMatchObject({
    microphoneId: "usb-mic",
    message: null,
  });
  harness.detach();
});

test("falls back to the default microphone when selected-device reacquire fails", async () => {
  const harness = setup();
  await harness.settings.setMicrophone("usb-mic");
  const fallback = capture();
  harness.devices.getUserMedia
    .mockRejectedValueOnce(new Error("stale device list"))
    .mockResolvedValueOnce(fallback.stream);
  harness.replacement.track.readyState = "ended";

  await harness.settings.refresh(true);

  expect(harness.devices.getUserMedia).toHaveBeenNthCalledWith(2, {
    audio: {
      autoGainControl: true,
      deviceId: { exact: "usb-mic" },
      echoCancellation: true,
      noiseSuppression: true,
    },
  });
  expect(harness.devices.getUserMedia).toHaveBeenNthCalledWith(3, {
    audio: {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });
  expect(harness.settings.getSnapshot().devices).toMatchObject({
    microphoneId: "",
    message: "Microphone disconnected. Switched to system default.",
  });
  harness.detach();
});

test("preserves a microphone recovery failure after speaker recovery succeeds", async () => {
  const harness = setup();
  await harness.settings.setMicrophone("usb-mic");
  await harness.settings.setSpeaker("headphones");
  harness.devices.getUserMedia.mockRejectedValueOnce(new Error("closed"));
  harness.devices.enumerateDevices.mockResolvedValue([
    device("audioinput", "built-in"),
  ]);

  harness.devices.dispatchEvent(new Event("devicechange"));

  await vi.waitFor(() =>
    expect(harness.settings.getSnapshot().devices).toMatchObject({
      speakerId: "",
      busy: false,
    }),
  );
  expect(harness.settings.getSnapshot().devices.message).toContain(
    "Could not switch microphone",
  );
  harness.detach();
});

test("clears a disconnected microphone selection when fallback fails", async () => {
  const harness = setup();
  await harness.settings.setMicrophone("usb-mic");
  harness.devices.getUserMedia.mockRejectedValueOnce(new Error("closed"));
  harness.devices.enumerateDevices.mockResolvedValue([
    device("audioinput", "built-in"),
    device("audiooutput", "headphones"),
  ]);

  harness.devices.dispatchEvent(new Event("devicechange"));

  await vi.waitFor(() =>
    expect(harness.settings.getSnapshot().devices).toMatchObject({
      microphoneId: "",
      busy: false,
    }),
  );
  expect(harness.settings.getSnapshot().devices.message).toContain(
    "Could not switch microphone",
  );
  harness.detach();
});

test("retries default speaker recovery after a transient failure", async () => {
  const harness = setup();
  await harness.settings.setSpeaker("headphones");
  harness.audio.setSinkId.mockRejectedValueOnce(new Error("closed"));
  harness.devices.enumerateDevices.mockResolvedValue([
    device("audioinput", "built-in"),
  ]);

  await harness.settings.refresh(true);

  expect(harness.settings.getSnapshot().devices).toMatchObject({
    speakerId: "headphones",
    message: "Could not switch speaker. Check the device and try again.",
  });
  await harness.settings.refresh(true);
  expect(harness.audio.setSinkId).toHaveBeenNthCalledWith(3, "");
  expect(harness.settings.getSnapshot().devices).toMatchObject({
    speakerId: "",
    message: "Speaker disconnected. Switched to system default.",
  });
  harness.detach();
});

test("queues device recovery while an output switch is pending", async () => {
  const harness = setup();
  const pending = Promise.withResolvers<void>();
  harness.audio.setSinkId.mockReturnValueOnce(pending.promise);
  const switching = harness.settings.setSpeaker("headphones");
  harness.initial.track.readyState = "ended";
  harness.devices.dispatchEvent(new Event("devicechange"));
  pending.resolve();
  await switching;
  await vi.waitFor(() =>
    expect(harness.replaceMicrophone).toHaveBeenCalledOnce(),
  );
  expect(harness.devices.getUserMedia).toHaveBeenCalledWith({
    audio: {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });
  harness.detach();
});

test("reports permission failure without replacing capture or output", async () => {
  const harness = setup();
  harness.devices.getUserMedia.mockRejectedValueOnce(
    new DOMException("denied", "NotAllowedError"),
  );
  await harness.settings.setMicrophone("usb-mic");
  expect(harness.settings.getSnapshot().devices.message).toContain(
    "Microphone access denied",
  );
  expect(harness.replaceMicrophone).not.toHaveBeenCalled();
  harness.audio.setSinkId.mockRejectedValueOnce(
    new DOMException("denied", "NotAllowedError"),
  );
  await harness.settings.setSpeaker("headphones");
  expect(harness.settings.getSnapshot().devices.message).toContain(
    "Speaker access denied",
  );
  expect(harness.settings.getSnapshot().devices.speakerId).toBe("");
  harness.detach();
});

test("clears a device-listing error after a successful refresh", async () => {
  const harness = setup();
  await harness.settings.refresh();
  harness.devices.enumerateDevices.mockRejectedValueOnce(new Error("blocked"));
  await harness.settings.refresh();
  expect(harness.settings.getSnapshot().devices.message).toContain(
    "Could not list audio devices",
  );
  await harness.settings.refresh();
  expect(harness.settings.getSnapshot().devices.message).toBeNull();
  harness.detach();
});

test("shows missing devices and allows refreshing a dead default microphone", async () => {
  const harness = setup();
  await harness.settings.refresh();
  harness.devices.enumerateDevices.mockResolvedValue([]);
  harness.devices.getUserMedia.mockRejectedValueOnce(
    new DOMException("missing", "NotFoundError"),
  );
  harness.initial.track.readyState = "ended";
  await harness.settings.refresh(true);
  expect(harness.settings.getSnapshot().devices.message).toContain(
    "No microphone detected",
  );
  harness.devices.enumerateDevices.mockResolvedValue([
    device("audioinput", "built-in"),
  ]);
  await harness.settings.refresh(true);
  expect(harness.replaceMicrophone).toHaveBeenCalledOnce();
  harness.detach();
});

test("requests speaker permission synchronously from the action", async () => {
  const harness = setup();
  harness.settings.actions.requestSpeaker();
  expect(harness.devices.selectAudioOutput).toHaveBeenCalledOnce();
  await vi.waitFor(() =>
    expect(harness.audio.setSinkId).toHaveBeenCalledWith("headphones"),
  );
  harness.detach();
});

test("speaker permission completion does not unlock a pending microphone recovery", async () => {
  const harness = setup();
  await harness.settings.refresh();
  const permission = Promise.withResolvers<MediaDeviceInfo>();
  const captureResult = Promise.withResolvers<MediaStream>();
  harness.devices.selectAudioOutput.mockReturnValueOnce(permission.promise);
  harness.devices.getUserMedia.mockReturnValueOnce(captureResult.promise);
  const request = harness.settings.requestSpeaker();
  harness.initial.track.readyState = "ended";
  harness.devices.dispatchEvent(new Event("devicechange"));
  permission.resolve(device("audiooutput", "headphones"));
  await request;
  await vi.waitFor(() =>
    expect(harness.devices.getUserMedia).toHaveBeenCalledOnce(),
  );
  expect(harness.settings.getSnapshot().devices.busy).toBe(true);
  captureResult.resolve(harness.replacement.stream);
  await vi.waitFor(() =>
    expect(harness.settings.getSnapshot().devices.busy).toBe(false),
  );
  harness.detach();
});
