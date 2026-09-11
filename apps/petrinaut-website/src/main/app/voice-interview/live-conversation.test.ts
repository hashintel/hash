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
  const input = { stop: vi.fn() };
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
