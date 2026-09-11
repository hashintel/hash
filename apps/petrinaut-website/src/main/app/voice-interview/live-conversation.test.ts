// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";

import { createLiveConversation } from "./live-conversation";

const setup = () => {
  const sent: string[] = [];
  const channel = Object.assign(new EventTarget(), {
    readyState: "open",
    send: (data: string) => sent.push(data),
    close: vi.fn(),
  });
  const input = Object.assign(new EventTarget(), { stop: vi.fn() });
  const output = { stop: vi.fn() };
  const stream = { getTracks: () => [input] };
  const peer = Object.assign(new EventTarget(), {
    connectionState: "new",
    iceGatheringState: "complete",
    localDescription: { type: "offer", sdp: "v=0\r\no=complete-offer" },
    createDataChannel: vi.fn(() => channel),
    addTrack: vi.fn(),
    createOffer: vi.fn(async () => ({ type: "offer", sdp: "v=0" })),
    setLocalDescription: vi.fn(async () => undefined),
    setRemoteDescription: vi.fn(async () => undefined),
    close: vi.fn(),
    getReceivers: () => [{ track: output }],
  });
  const audio = {
    srcObject: null,
    autoplay: false,
    muted: false,
    paused: false,
    play: vi.fn(async () => undefined),
    pause: vi.fn(),
  };
  vi.stubGlobal(
    "RTCPeerConnection",
    class {
      constructor() {
        return peer;
      }
    },
  );
  vi.stubGlobal(
    "Audio",
    class {
      constructor() {
        return audio;
      }
    },
  );
  const getUserMedia = vi.fn(async () => stream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  const fetch = vi.fn(async () =>
    Response.json({ sessionId: "opaque/id", sdp: "v=0\r\no=answer" }),
  );
  vi.stubGlobal("fetch", fetch);
  const onState = vi.fn<Parameters<typeof createLiveConversation>[0]>();
  const conversation = createLiveConversation(onState, 15_000);
  const emit = (data: unknown) =>
    channel.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(data) }),
    );
  return {
    conversation,
    emit,
    sent,
    channel,
    input,
    output,
    peer,
    audio,
    getUserMedia,
    fetch,
    onState,
  };
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("waits for session.started after SDP; never sends session.start or handles transcript/delegation as tasks", async () => {
  const fixture = setup();
  expect(fixture.getUserMedia).not.toHaveBeenCalled();
  await fixture.conversation.start();
  expect(fixture.onState).toHaveBeenLastCalledWith(
    expect.objectContaining({ phase: "connecting" }),
  );
  expect(fixture.fetch).toHaveBeenCalledWith(
    "/api/voice/live-session",
    expect.objectContaining({ body: "v=0\r\no=complete-offer" }),
  );
  expect(fixture.peer.createDataChannel).toHaveBeenCalledWith("oai-events");
  fixture.emit({ type: "session.started" });
  expect(fixture.onState).toHaveBeenLastCalledWith({
    phase: "connected",
    message: null,
  });
  fixture.emit({
    type: "session.input_transcript.delta",
    delta: "Change the model",
  });
  fixture.emit({ type: "session.output_transcript.delta", delta: "Done" });
  fixture.emit({
    type: "session.delegation.created",
    delegation: { id: "metadata-only", target: "client" },
  });
  expect(fixture.sent).toEqual([]);
  expect(fixture.fetch).toHaveBeenCalledTimes(1);
  const stopped = fixture.conversation.stop();
  expect(fixture.input.stop).toHaveBeenCalled();
  expect(fixture.output.stop).toHaveBeenCalled();
  expect(fixture.audio.pause).toHaveBeenCalled();
  expect(fixture.audio.srcObject).toBeNull();
  expect(fixture.sent.map((event) => JSON.parse(event))).toEqual([
    { type: "session.close" },
  ]);
  expect(fixture.peer.close).not.toHaveBeenCalled();
  fixture.emit({ type: "session.closed" });
  await stopped;
  expect(fixture.peer.close).toHaveBeenCalledOnce();
  expect(fixture.onState).toHaveBeenLastCalledWith({
    phase: "ended",
    message: "Microphone and playback stopped. Live confirmed session closure.",
  });
});

test("releases late microphone permission without ever creating a provider session", async () => {
  const fixture = setup();
  let release!: (
    stream: Awaited<ReturnType<typeof fixture.getUserMedia>>,
  ) => void;
  fixture.getUserMedia.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const started = fixture.conversation.start();
  await fixture.conversation.stop();
  release({ getTracks: () => [fixture.input] });
  await started;
  expect(fixture.input.stop).toHaveBeenCalled();
  expect(fixture.fetch).not.toHaveBeenCalled();
});

test("reports missing remote closure honestly and cleans transport after bounded wait", async () => {
  vi.useFakeTimers();
  const fixture = setup();
  await fixture.conversation.start();
  fixture.emit({ type: "session.started" });
  const stopped = fixture.conversation.stop();
  await vi.advanceTimersByTimeAsync(2_000);
  await stopped;
  expect(fixture.peer.close).toHaveBeenCalled();
  expect(fixture.onState.mock.lastCall?.[0].phase).toBe("ended");
  expect(fixture.onState.mock.lastCall?.[0].message).toContain("not confirmed");
});

test("times out connection without inventing turn completion or retrying", async () => {
  vi.useFakeTimers();
  const fixture = setup();
  await fixture.conversation.start();
  await vi.advanceTimersByTimeAsync(17_000);
  expect(fixture.input.stop).toHaveBeenCalled();
  expect(fixture.onState.mock.lastCall?.[0].phase).toBe("error");
  expect(fixture.onState.mock.lastCall?.[0].message).toContain("timed out");
  expect(fixture.fetch).toHaveBeenCalledTimes(1);
});

test("provider errors stop both media directions without exposing payloads", async () => {
  const fixture = setup();
  await fixture.conversation.start();
  fixture.emit({ type: "session.started" });
  fixture.emit({
    type: "error",
    error: { message: "sensitive provider detail" },
  });
  expect(fixture.input.stop).toHaveBeenCalled();
  expect(fixture.output.stop).toHaveBeenCalled();
  fixture.emit({ type: "session.closed" });
  expect(fixture.onState.mock.lastCall?.[0].phase).toBe("error");
  expect(fixture.onState.mock.lastCall?.[0].message).not.toContain("sensitive");
});

test.each([false, true])(
  "microphone loss stops playback and closes without restarting (session started: %s)",
  async (ready) => {
    const fixture = setup();
    await fixture.conversation.start();
    if (ready) fixture.emit({ type: "session.started" });
    fixture.input.dispatchEvent(new Event("ended"));
    expect(fixture.audio.pause).toHaveBeenCalled();
    expect(fixture.audio.muted).toBe(true);
    expect(fixture.output.stop).toHaveBeenCalled();
    expect(fixture.sent).toEqual(ready ? ['{"type":"session.close"}'] : []);
    if (ready) fixture.emit({ type: "session.closed" });
    await fixture.conversation.stop();
    expect(fixture.peer.close).toHaveBeenCalledOnce();
    expect(fixture.onState.mock.lastCall?.[0].phase).toBe("error");
    expect(fixture.onState.mock.lastCall?.[0].message).toContain(
      "Microphone disconnected",
    );
    expect(fixture.getUserMedia).toHaveBeenCalledOnce();
    expect(fixture.fetch).toHaveBeenCalledOnce();
  },
);

test("Stop before session.started never sends application commands", async () => {
  vi.useFakeTimers();
  const fixture = setup();
  await fixture.conversation.start();
  const stopped = fixture.conversation.stop();
  await vi.advanceTimersByTimeAsync(2_000);
  await stopped;
  expect(fixture.sent).toEqual([]);
  expect(fixture.onState.mock.lastCall?.[0].message).toContain("not confirmed");
});

test("plays the remote track while microphone remains attached, then stops both", async () => {
  const fixture = setup();
  await fixture.conversation.start();
  fixture.emit({ type: "session.started" });
  const remoteStream = { getTracks: () => [fixture.output] };
  fixture.peer.dispatchEvent(
    Object.assign(new Event("track"), {
      track: fixture.output,
      streams: [remoteStream],
    }),
  );
  expect(fixture.audio.srcObject).toBe(remoteStream);
  expect(fixture.audio.play).toHaveBeenCalledOnce();
  expect(fixture.peer.addTrack).toHaveBeenCalledWith(
    fixture.input,
    expect.anything(),
  );
  expect(fixture.input.stop).not.toHaveBeenCalled();
  const stopped = fixture.conversation.stop();
  fixture.emit({ type: "session.closed" });
  await stopped;
  expect(fixture.audio.pause).toHaveBeenCalled();
  expect(fixture.input.stop).toHaveBeenCalled();
});

test("reports local audio activity without treating silence or transcripts as turn completion", async () => {
  vi.useFakeTimers();
  const fixture = setup();
  const levels = { input: 0.24, output: 0 };
  const getStats = vi.fn(
    async () =>
      new Map([
        [
          "input",
          { type: "media-source", kind: "audio", audioLevel: levels.input },
        ],
        [
          "output",
          { type: "inbound-rtp", kind: "audio", audioLevel: levels.output },
        ],
      ]),
  );
  Object.assign(fixture.peer, { getStats });
  await fixture.conversation.start();
  await vi.advanceTimersByTimeAsync(100);
  expect(getStats).not.toHaveBeenCalled();
  fixture.emit({ type: "session.started" });
  fixture.peer.dispatchEvent(
    Object.assign(new Event("track"), {
      track: fixture.output,
      streams: [{ getTracks: () => [fixture.output] }],
    }),
  );
  await vi.advanceTimersByTimeAsync(100);
  expect(fixture.onState).toHaveBeenLastCalledWith(
    expect.objectContaining({
      phase: "connected",
      activity: { microphoneLevel: 0.24, outputActive: false },
    }),
  );
  levels.output = 0.2;
  await vi.advanceTimersByTimeAsync(100);
  expect(fixture.onState).toHaveBeenLastCalledWith(
    expect.objectContaining({
      activity: { microphoneLevel: 0.24, outputActive: true },
    }),
  );
  expect(fixture.input.stop).not.toHaveBeenCalled();
  levels.output = 0;
  await vi.advanceTimersByTimeAsync(100);
  expect(fixture.onState.mock.lastCall?.[0]).toMatchObject({
    activity: { outputActive: true },
  });
  await vi.advanceTimersByTimeAsync(400);
  fixture.emit({
    type: "session.output_transcript.delta",
    delta: "Not playback",
  });
  expect(fixture.onState.mock.lastCall?.[0]).toMatchObject({
    phase: "connected",
    activity: { outputActive: false },
  });
  levels.output = 0.2;
  fixture.audio.paused = true;
  await vi.advanceTimersByTimeAsync(100);
  expect(fixture.onState.mock.lastCall?.[0]).toMatchObject({
    activity: { outputActive: false },
  });
  fixture.audio.paused = false;
  fixture.audio.muted = true;
  await vi.advanceTimersByTimeAsync(100);
  expect(fixture.onState.mock.lastCall?.[0]).toMatchObject({
    activity: { outputActive: false },
  });
  expect(fixture.sent).toEqual([]);
  expect(fixture.fetch).toHaveBeenCalledTimes(1);
  const stopped = fixture.conversation.stop();
  const samples = getStats.mock.calls.length;
  await vi.advanceTimersByTimeAsync(100);
  expect(getStats).toHaveBeenCalledTimes(samples);
  fixture.emit({ type: "session.closed" });
  await stopped;
});

test("missing or failed telemetry does not end the session; a late sample cannot revive it after Stop", async () => {
  vi.useFakeTimers();
  const fixture = setup();
  const getStats = vi.fn(async (): Promise<Map<string, unknown>> => new Map());
  Object.assign(fixture.peer, { getStats });
  await fixture.conversation.start();
  fixture.emit({ type: "session.started" });
  await vi.advanceTimersByTimeAsync(100);
  expect(fixture.onState.mock.lastCall?.[0]).toMatchObject({
    phase: "connected",
    activity: { microphoneLevel: 0, outputActive: false },
  });
  getStats.mockRejectedValueOnce(new Error("Telemetry unavailable"));
  await vi.advanceTimersByTimeAsync(100);
  expect(fixture.input.stop).not.toHaveBeenCalled();
  expect(fixture.sent).toEqual([]);
  let release!: (stats: Map<string, unknown>) => void;
  getStats.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await vi.advanceTimersByTimeAsync(100);
  const stopped = fixture.conversation.stop();
  fixture.emit({ type: "session.closed" });
  await stopped;
  const updates = fixture.onState.mock.calls.length;
  const samples = getStats.mock.calls.length;
  release(
    new Map([
      ["late", { type: "media-source", kind: "audio", audioLevel: 0.9 }],
    ]),
  );
  await vi.advanceTimersByTimeAsync(500);
  expect(fixture.onState).toHaveBeenCalledTimes(updates);
  expect(getStats).toHaveBeenCalledTimes(samples);
  expect(fixture.fetch).toHaveBeenCalledTimes(1);
});
