import { afterEach, expect, test, vi } from "vitest";

import { previewVoice } from "./preview";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const setup = () => {
  vi.useFakeTimers();
  const channel = Object.assign(new EventTarget(), {
    send: vi.fn(),
    close: vi.fn(),
    readyState: "open",
  });
  const peer = Object.assign(new EventTarget(), {
    createDataChannel: () => channel,
    iceGatheringState: "complete",
    addTrack: vi.fn(),
    createOffer: vi.fn(async () => ({ type: "offer", sdp: "v=0 offer" })),
    setLocalDescription: vi.fn(async () => {}),
    localDescription: { sdp: "v=0 offer" },
    setRemoteDescription: vi.fn(async () => {}),
    close: vi.fn(),
  });
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  const audio = {
    srcObject: null,
    muted: false,
    volume: 1,
    setSinkId: vi.fn(async (_id: string) => {}),
    play: vi.fn(async () => {}),
    pause: vi.fn(),
  };
  let signal = 0;
  const node = {
    connect: vi.fn().mockReturnThis(),
    start: vi.fn(),
    stop: vi.fn(),
    gain: { value: 1 },
  };
  const context = {
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    createMediaStreamDestination: () => ({ stream }),
    createOscillator: () => node,
    createGain: () => node,
    createMediaStreamSource: () => node,
    createAnalyser: () => ({
      fftSize: 8,
      getFloatTimeDomainData: (samples: Float32Array) => samples.fill(signal),
    }),
  };
  vi.stubGlobal("AudioContext", function MockAudioContext() {
    return context;
  });
  vi.stubGlobal("Audio", function MockAudio() {
    return audio;
  });
  vi.stubGlobal("RTCPeerConnection", function MockPeerConnection() {
    return peer;
  });
  const fetch = vi.fn(async () => new Response("v=0 answer"));
  vi.stubGlobal("fetch", fetch);
  const output = { muted: false, volume: 0.35, sinkId: "headphones" };
  const onState = vi.fn();
  const options = {
    provider: "realtime" as const,
    voice: "cedar",
    output: () => output,
    onState,
  };
  const receiveTrack = () =>
    peer.dispatchEvent(
      Object.assign(new Event("track"), { streams: [stream], track }),
    );
  const receive = (type: string) =>
    channel.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify({ type }) }),
    );
  return {
    channel,
    peer,
    track,
    audio,
    context,
    node,
    fetch,
    output,
    onState,
    options,
    receive,
    receiveTrack,
    sound: (value: number) => {
      signal = value;
    },
  };
};

test.each(["live", "realtime"] as const)(
  "previews the exact %s voice using only silent input",
  async (provider) => {
    const harness = setup();
    harness.fetch.mockImplementation(async () =>
      provider === "live"
        ? Response.json({ sdp: "v=0 live" })
        : new Response("v=0 realtime"),
    );
    const stop = previewVoice({
      ...harness.options,
      provider,
      voice: provider === "live" ? "quartz" : "cedar",
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.fetch).toHaveBeenCalledWith(
      `/api/voice/${provider === "live" ? "live-session" : "realtime-call"}`,
      expect.objectContaining({
        headers: {
          "content-type": "application/sdp",
          "x-petrinaut-voice": provider === "live" ? "quartz" : "cedar",
        },
      }),
    );
    expect(harness.node.gain.value).toBe(0);
    expect(harness.peer.addTrack).toHaveBeenCalledWith(
      harness.track,
      expect.anything(),
    );
    expect(harness.channel.send).not.toHaveBeenCalled();
    harness.receive(
      provider === "live" ? "session.started" : "session.created",
    );
    expect(
      JSON.parse(harness.channel.send.mock.calls[0]![0] as string),
    ).toMatchObject(
      provider === "live"
        ? { type: "session.instructions.append", delegation_id: null }
        : {
            type: "response.create",
            response: {
              conversation: "none",
              input: [],
              tools: [],
              tool_choice: "none",
            },
          },
    );
    stop();
    if (provider === "live") {
      expect(harness.peer.close).not.toHaveBeenCalled();
      expect(harness.channel.send).toHaveBeenLastCalledWith(
        JSON.stringify({ type: "session.close" }),
      );
      harness.receive("session.closed");
    }
    expect(harness.peer.close).toHaveBeenCalledOnce();
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.context.close).toHaveBeenCalledOnce();
  },
);

test("reports playing only for audible samples and follows mute, volume, and output", async () => {
  const harness = setup();
  previewVoice(harness.options);
  harness.receiveTrack();
  await vi.advanceTimersByTimeAsync(100);
  expect(harness.audio).toMatchObject({ muted: false, volume: 0.35 });
  expect(harness.audio.setSinkId).toHaveBeenLastCalledWith("headphones");
  expect(harness.onState).not.toHaveBeenCalledWith("playing");
  harness.sound(0.2);
  await vi.advanceTimersByTimeAsync(100);
  expect(harness.onState).toHaveBeenLastCalledWith("playing");
  harness.output.muted = true;
  harness.output.volume = 0.7;
  harness.output.sinkId = "";
  await vi.advanceTimersByTimeAsync(100);
  expect(harness.audio).toMatchObject({ muted: true, volume: 0.7 });
  expect(harness.audio.setSinkId).toHaveBeenLastCalledWith("");
  expect(harness.onState).toHaveBeenLastCalledWith(null);
  harness.sound(0);
  await vi.advanceTimersByTimeAsync(1000);
  expect(harness.peer.close).toHaveBeenCalledOnce();
  expect(harness.audio.pause).toHaveBeenCalledOnce();
});

test("stopping during connection ignores its late answer and events", async () => {
  const harness = setup();
  const pending = Promise.withResolvers<Response>();
  harness.fetch.mockReturnValue(pending.promise);
  const stop = previewVoice(harness.options);
  await vi.advanceTimersByTimeAsync(0);
  stop();
  pending.resolve(new Response("v=0 late"));
  harness.receive("session.created");
  harness.receiveTrack();
  await vi.advanceTimersByTimeAsync(0);
  expect(harness.peer.setRemoteDescription).not.toHaveBeenCalled();
  expect(harness.audio.play).not.toHaveBeenCalled();
  expect(harness.channel.send).not.toHaveBeenCalled();
  expect(harness.onState.mock.calls).toEqual([["loading"], [null, undefined]]);
});

test("bounds stalled previews and releases resources on denied playback", async () => {
  const harness = setup();
  previewVoice(harness.options);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(harness.onState).toHaveBeenLastCalledWith(
    null,
    expect.stringContaining("timed out"),
  );
  expect(harness.peer.close).toHaveBeenCalledOnce();
  harness.peer.close.mockClear();
  harness.audio.play.mockRejectedValue(
    new DOMException("Blocked", "NotAllowedError"),
  );
  previewVoice(harness.options);
  harness.receiveTrack();
  await vi.advanceTimersByTimeAsync(0);
  expect(harness.onState).toHaveBeenLastCalledWith(
    null,
    expect.stringContaining("Preview unavailable"),
  );
  expect(harness.peer.close).toHaveBeenCalledOnce();
});
