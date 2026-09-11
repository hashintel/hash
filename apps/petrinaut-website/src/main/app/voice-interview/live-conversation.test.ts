// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";

import { createLiveConversation } from "./live-conversation";

const setup = () => {
  const sent = [[], []] as [string[], string[]];
  const createChannel = (events: string[]) =>
    Object.assign(new EventTarget(), {
      readyState: "open",
      send: (data: string) => events.push(data),
      close: vi.fn(),
    });
  const channels = [createChannel(sent[0]), createChannel(sent[1])] as const;
  const input = Object.assign(new EventTarget(), { stop: vi.fn() });
  const outputs = [{ stop: vi.fn() }, { stop: vi.fn() }];
  const stream = { getTracks: () => [input] };
  const peers = channels.map((channel, index) =>
    Object.assign(new EventTarget(), {
      connectionState: "new",
      iceGatheringState: "complete",
      localDescription: { type: "offer", sdp: `v=0\r\no=offer-${index}` },
      createDataChannel: vi.fn(() => channel),
      addTrack: vi.fn(),
      createOffer: vi.fn(async () => ({ type: "offer", sdp: "v=0" })),
      setLocalDescription: vi.fn(async () => undefined),
      setRemoteDescription: vi.fn(async () => undefined),
      close: vi.fn(),
      getReceivers: () => [{ track: outputs[index]! }],
      getStats: vi.fn(async () => new Map()),
    }),
  );
  let peerIndex = 0;
  const RTCPeerConnectionMock = vi.fn(function createPeer(this: unknown) {
    return peers[peerIndex++]!;
  });
  vi.stubGlobal("RTCPeerConnection", RTCPeerConnectionMock);
  const audio = {
    srcObject: null,
    muted: false,
    paused: false,
    play: vi.fn(async () => undefined),
    pause: vi.fn(),
  };
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
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      url.endsWith("transcription-session")
        ? { sdp: "v=0\r\no=transcription-answer" }
        : { sessionId: "opaque", sdp: "v=0\r\no=live-answer" },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const onState = vi.fn<Parameters<typeof createLiveConversation>[0]>();
  const onFinalizedInput =
    vi.fn<Parameters<typeof createLiveConversation>[2]>();
  const conversation = createLiveConversation(
    onState,
    15_000,
    onFinalizedInput,
  );
  const emit = (connection: 0 | 1, data: unknown) =>
    channels[connection].dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(data) }),
    );
  return {
    conversation,
    emit,
    sent,
    channels,
    input,
    outputs,
    stream,
    peers,
    audio,
    getUserMedia,
    fetch,
    onState,
    onFinalizedInput,
  };
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const connect = async (fixture: ReturnType<typeof setup>) => {
  await fixture.conversation.start();
  fixture.emit(0, { type: "session.started" });
  fixture.emit(1, { type: "session.created" });
};

test.each([0, 1] as const)(
  "connection %s recovers without replacing sessions or replaying finalized input",
  async (connection) => {
    vi.useFakeTimers();
    const fixture = setup();
    let release = (_stats: Map<string, unknown>) => {};
    fixture.peers[0]!.getStats.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await connect(fixture);
    await vi.advanceTimersByTimeAsync(100);
    const peer = fixture.peers[connection]!;
    peer.connectionState = "disconnected";
    peer.dispatchEvent(new Event("connectionstatechange"));
    expect(fixture.input.stop).not.toHaveBeenCalled();
    expect(fixture.audio.pause).not.toHaveBeenCalled();
    release(new Map());
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fixture.onState.mock.lastCall?.[0].phase).toBe("connecting");
    // Completed, ordered events still use the existing admission path.
    const completed = {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "one",
      content_index: 0,
      transcript: "Actually, three machines",
    };
    fixture.emit(1, {
      type: "input_audio_buffer.committed",
      item_id: "one",
      previous_item_id: null,
    });
    fixture.emit(1, completed);
    expect(fixture.onFinalizedInput).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ text: "Actually, three machines" }),
    );
    expect(fixture.conversation.appendCommentary("Settled answer")).toBe(true);
    peer.connectionState = "connected";
    peer.dispatchEvent(new Event("connectionstatechange"));
    expect(fixture.onState.mock.lastCall?.[0].phase).toBe("connected");
    fixture.emit(1, completed);
    await vi.advanceTimersByTimeAsync(16_000);
    expect(fixture.input.stop).not.toHaveBeenCalled();
    expect(fixture.onFinalizedInput).toHaveBeenCalledOnce();
    expect(fixture.sent[0]).toHaveLength(1);
    expect(fixture.sent[1]).toEqual([]);
    expect(fixture.fetch).toHaveBeenCalledTimes(2);
    expect(fixture.getUserMedia).toHaveBeenCalledOnce();
    const stopped = fixture.conversation.stop();
    fixture.emit(0, { type: "session.closed" });
    await stopped;
    expect(vi.getTimerCount()).toBe(0);
  },
);

test.each([0, 1] as const)(
  "connection %s has a fixed recovery deadline and cannot revive after timeout",
  async (connection) => {
    vi.useFakeTimers();
    const fixture = setup();
    await connect(fixture);
    const peer = fixture.peers[connection]!;
    peer.connectionState = "disconnected";
    peer.dispatchEvent(new Event("connectionstatechange"));
    await vi.advanceTimersByTimeAsync(5_000);
    peer.dispatchEvent(new Event("connectionstatechange"));
    await vi.advanceTimersByTimeAsync(9_999);
    expect(fixture.input.stop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.input.stop).toHaveBeenCalled();
    expect(fixture.audio.pause).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fixture.onState.mock.lastCall?.[0].phase).toBe("error");
    expect(fixture.onState.mock.lastCall?.[0].message).toContain(
      "did not recover",
    );
    const updates = fixture.onState.mock.calls.length;
    peer.connectionState = "connected";
    peer.dispatchEvent(new Event("connectionstatechange"));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fixture.onState).toHaveBeenCalledTimes(updates);
    expect(fixture.fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  },
);

test("recovering one peer does not clear the other peer's deadline or show connected", async () => {
  vi.useFakeTimers();
  const fixture = setup();
  await connect(fixture);
  const live = fixture.peers[0]!;
  const transcription = fixture.peers[1]!;
  live.connectionState = "disconnected";
  live.dispatchEvent(new Event("connectionstatechange"));
  await vi.advanceTimersByTimeAsync(5_000);
  transcription.connectionState = "disconnected";
  transcription.dispatchEvent(new Event("connectionstatechange"));
  live.connectionState = "connected";
  live.dispatchEvent(new Event("connectionstatechange"));
  await vi.advanceTimersByTimeAsync(14_999);
  expect(fixture.input.stop).not.toHaveBeenCalled();
  expect(fixture.onState.mock.lastCall?.[0].phase).toBe("connecting");
  await vi.advanceTimersByTimeAsync(1);
  expect(fixture.input.stop).toHaveBeenCalled();
  fixture.emit(0, { type: "session.closed" });
  expect(fixture.onState.mock.lastCall?.[0].message).toContain(
    "Transcription media connection did not recover",
  );
  expect(vi.getTimerCount()).toBe(0);
});

test.each([0, 1] as const)(
  "a handshake disconnect on connection %s stays bounded after both ready events",
  async (connection) => {
    vi.useFakeTimers();
    const fixture = setup();
    await fixture.conversation.start();
    const peer = fixture.peers[connection]!;
    peer.connectionState = "disconnected";
    peer.dispatchEvent(new Event("connectionstatechange"));
    await vi.advanceTimersByTimeAsync(5_000);
    fixture.emit(0, { type: "session.started" });
    fixture.emit(1, { type: "session.created" });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(fixture.input.stop).not.toHaveBeenCalled();
    expect(fixture.onState.mock.lastCall?.[0].phase).toBe("connecting");
    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.input.stop).toHaveBeenCalled();
    fixture.emit(0, { type: "session.closed" });
    expect(vi.getTimerCount()).toBe(0);
  },
);

test("Stop cancels both recovery deadlines and ignores late connections", async () => {
  vi.useFakeTimers();
  const fixture = setup();
  await connect(fixture);
  for (const peer of fixture.peers) {
    peer.connectionState = "disconnected";
    peer.dispatchEvent(new Event("connectionstatechange"));
  }
  expect(fixture.input.stop).not.toHaveBeenCalled();
  const stopped = fixture.conversation.stop();
  fixture.emit(0, { type: "session.closed" });
  await stopped;
  const updates = fixture.onState.mock.calls.length;
  for (const peer of fixture.peers) {
    peer.connectionState = "connected";
    peer.dispatchEvent(new Event("connectionstatechange"));
  }
  await vi.advanceTimersByTimeAsync(20_000);
  expect(fixture.onState).toHaveBeenCalledTimes(updates);
  expect(fixture.onState.mock.lastCall?.[0].phase).toBe("ended");
  expect(vi.getTimerCount()).toBe(0);
});

test.each([
  [0, "failed"],
  [0, "closed"],
  [1, "failed"],
  [1, "closed"],
] as const)(
  "terminal connection %s state %s still stops immediately",
  async (connection, state) => {
    const fixture = setup();
    await connect(fixture);
    const peer = fixture.peers[connection]!;
    peer.connectionState = state;
    peer.dispatchEvent(new Event("connectionstatechange"));
    expect(fixture.input.stop).toHaveBeenCalled();
    expect(fixture.audio.pause).toHaveBeenCalled();
    fixture.emit(0, { type: "session.closed" });
    expect(fixture.onState.mock.lastCall?.[0].phase).toBe("error");
  },
);

test("starts Live and transcription WebRTC from one consented capture and connects only when both are usable", async () => {
  const fixture = setup();
  await fixture.conversation.start();
  expect(fixture.getUserMedia).toHaveBeenCalledOnce();
  expect(fixture.fetch.mock.calls.map(([url]) => url)).toEqual([
    "/api/voice/live-session",
    "/api/voice/transcription-session",
  ]);
  expect(fixture.peers[0]!.addTrack).toHaveBeenCalledWith(
    fixture.input,
    fixture.stream,
  );
  expect(fixture.peers[1]!.addTrack).toHaveBeenCalledWith(
    fixture.input,
    fixture.stream,
  );
  fixture.emit(0, { type: "session.started" });
  expect(fixture.onState.mock.lastCall?.[0].phase).toBe("connecting");
  fixture.emit(1, { type: "session.created" });
  expect(fixture.onState).toHaveBeenLastCalledWith({
    phase: "connected",
    message: null,
  });
});

test("emits only completed transcripts in committed provider order and deduplicates identical events", async () => {
  const fixture = setup();
  await connect(fixture);
  fixture.emit(1, {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "second",
    content_index: 0,
    transcript: "Second",
  });
  fixture.emit(1, {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "first",
    content_index: 0,
    transcript: "First",
  });
  fixture.emit(1, {
    type: "input_audio_buffer.committed",
    item_id: "first",
    previous_item_id: null,
  });
  expect(fixture.onFinalizedInput.mock.lastCall?.[0].id).toMatch(
    /^voice-live:[^:]+:first:0$/u,
  );
  expect(fixture.onFinalizedInput.mock.lastCall?.[0].text).toBe("First");
  fixture.emit(1, {
    type: "input_audio_buffer.committed",
    item_id: "second",
    previous_item_id: "first",
  });
  fixture.emit(1, {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "second",
    content_index: 0,
    transcript: "Second",
  });
  expect(
    fixture.onFinalizedInput.mock.calls.map(([input]) => input.text),
  ).toEqual(["First", "Second"]);
  expect(fixture.onFinalizedInput.mock.lastCall?.[0].id).toMatch(
    /^voice-live:[^:]+:second:0$/u,
  );
  fixture.emit(1, {
    type: "conversation.item.input_audio_transcription.delta",
    item_id: "third",
    delta: "ignored",
  });
  fixture.emit(0, { type: "session.input_transcript.delta", delta: "ignored" });
  expect(fixture.onFinalizedInput).toHaveBeenCalledTimes(2);
});

test("conflicting transcript identity fails visibly, stops both connections, and ignores late callbacks", async () => {
  const fixture = setup();
  await connect(fixture);
  fixture.emit(1, {
    type: "input_audio_buffer.committed",
    item_id: "one",
    previous_item_id: null,
  });
  fixture.emit(1, {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "one",
    content_index: 0,
    transcript: "One",
  });
  fixture.emit(1, {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "one",
    content_index: 0,
    transcript: "Changed",
  });
  expect(fixture.input.stop).toHaveBeenCalledOnce();
  expect(fixture.audio.pause).toHaveBeenCalled();
  fixture.emit(0, { type: "session.closed" });
  expect(fixture.onState.mock.lastCall?.[0]).toMatchObject({ phase: "error" });
  fixture.emit(1, {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "late",
    content_index: 0,
    transcript: "Late",
  });
  expect(fixture.onFinalizedInput).toHaveBeenCalledTimes(1);
});

test.each([true, false])(
  "transcription failure silences immediately and gives ready Live bounded graceful closure (confirmed: %s)",
  async (confirmed) => {
    vi.useFakeTimers();
    const fixture = setup();
    await fixture.conversation.start();
    fixture.emit(0, { type: "session.started" });
    fixture.emit(1, {
      type: "conversation.item.input_audio_transcription.failed",
      item_id: "one",
    });
    expect(fixture.input.stop).toHaveBeenCalledOnce();
    expect(fixture.audio.muted).toBe(true);
    expect(fixture.channels[1].close).toHaveBeenCalledOnce();
    expect(fixture.channels[0].close).not.toHaveBeenCalled();
    expect(fixture.sent[0]).toEqual([
      JSON.stringify({ type: "session.close" }),
    ]);
    expect(fixture.onState.mock.lastCall?.[0].phase).toBe("stopping");
    expect(fixture.onState.mock.lastCall?.[0].message).toContain(
      "Transcription failed",
    );
    fixture.emit(1, { type: "session.created" });
    fixture.emit(0, { type: "session.started" });
    expect(fixture.conversation.appendCommentary("Late answer")).toBe(false);
    if (confirmed) fixture.emit(0, { type: "session.closed" });
    else await vi.advanceTimersByTimeAsync(2_000);
    expect(fixture.onState.mock.lastCall?.[0]).toMatchObject({
      phase: "error",
    });
    expect(fixture.onState.mock.lastCall?.[0].message).toContain(
      "Transcription failed",
    );
    expect(fixture.onState.mock.lastCall?.[0].message).toContain(
      confirmed
        ? "Live confirmed session closure"
        : "Remote Live session closure was not confirmed",
    );
    expect(fixture.fetch).toHaveBeenCalledTimes(2);
    expect(fixture.peers[0]!.close).toHaveBeenCalledOnce();
    expect(fixture.peers[1]!.close).toHaveBeenCalled();
  },
);

test("appendCommentary sends the exact bounded Live event and reports only local send success", async () => {
  const fixture = setup();
  expect(fixture.conversation.appendCommentary("not connected")).toBe(false);
  await connect(fixture);
  expect(fixture.conversation.appendCommentary("Settled answer")).toBe(true);
  expect(JSON.parse(fixture.sent[0].at(-1)!)).toMatchObject({
    type: "session.commentary.append",
    delegation_id: null,
    content: "Settled answer",
  });
  expect(fixture.sent[0].at(-1)).toMatch(/"event_id":"[0-9a-f-]{36}"/u);
  expect(fixture.conversation.appendCommentary("x".repeat(501))).toBe(false);
  expect(fixture.conversation.appendCommentary("😀".repeat(126))).toBe(false);
  expect(fixture.sent[0]).toHaveLength(1);
});

test("Stop synchronously silences playback and capture, closes both transports, and does not claim transcription closure", async () => {
  vi.useFakeTimers();
  const fixture = setup();
  await connect(fixture);
  const stopped = fixture.conversation.stop();
  expect(fixture.input.stop).toHaveBeenCalledOnce();
  expect(fixture.audio.pause).toHaveBeenCalledOnce();
  expect(fixture.sent[0].map((event) => JSON.parse(event))).toContainEqual({
    type: "session.close",
  });
  expect(fixture.channels[1].close).toHaveBeenCalledOnce();
  fixture.emit(0, { type: "session.closed" });
  await stopped;
  expect(fixture.onState.mock.lastCall?.[0].message).toBe(
    "Microphone and playback stopped. Live confirmed session closure.",
  );
});

test("a failure on either media connection stops both and remote audio remains native and unbuffered", async () => {
  const fixture = setup();
  await connect(fixture);
  const remoteStream = { getTracks: () => [fixture.outputs[0]!] };
  fixture.peers[0]!.dispatchEvent(
    Object.assign(new Event("track"), {
      track: fixture.outputs[0]!,
      streams: [remoteStream],
    }),
  );
  expect(fixture.audio.srcObject).toBe(remoteStream);
  expect(fixture.audio.play).toHaveBeenCalledOnce();
  Object.assign(fixture.peers[1]!, { connectionState: "failed" });
  fixture.peers[1]!.dispatchEvent(new Event("connectionstatechange"));
  expect(fixture.input.stop).toHaveBeenCalledOnce();
  expect(fixture.peers[1]!.close).toHaveBeenCalledOnce();
  fixture.emit(0, { type: "session.closed" });
  expect(fixture.peers[0]!.close).toHaveBeenCalledOnce();
});

test("late transcription while waiting for Live closure cannot submit or revive the session", async () => {
  const fixture = setup();
  await connect(fixture);
  const stopped = fixture.conversation.stop();
  fixture.emit(1, {
    type: "input_audio_buffer.committed",
    item_id: "late",
    previous_item_id: null,
  });
  fixture.emit(1, {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "late",
    content_index: 0,
    transcript: "Do not submit",
  });
  expect(fixture.onFinalizedInput).not.toHaveBeenCalled();
  fixture.emit(0, { type: "session.closed" });
  await stopped;
});

test("provider item identities are namespaced to the consented local session", async () => {
  const ids: string[] = [];
  for (let index = 0; index < 2; index++) {
    const fixture = setup();
    await connect(fixture);
    fixture.emit(1, {
      type: "input_audio_buffer.committed",
      item_id: "one",
      previous_item_id: null,
    });
    fixture.emit(1, {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "one",
      content_index: 0,
      transcript: "Same words",
    });
    ids.push(fixture.onFinalizedInput.mock.calls[0]![0].id);
    fixture.emit(0, { type: "session.closed" });
  }
  expect(ids[0]).not.toBe(ids[1]);
});

test("a conflicting committed successor fails rather than silently dropping a correction", async () => {
  const fixture = setup();
  await connect(fixture);
  fixture.emit(1, {
    type: "input_audio_buffer.committed",
    item_id: "one",
    previous_item_id: null,
  });
  fixture.emit(1, {
    type: "input_audio_buffer.committed",
    item_id: "two",
    previous_item_id: "one",
  });
  fixture.emit(1, {
    type: "input_audio_buffer.committed",
    item_id: "three",
    previous_item_id: "one",
  });
  fixture.emit(0, { type: "session.closed" });
  expect(fixture.onState.mock.lastCall?.[0].phase).toBe("error");
});

test("permission resolving after Stop cannot start either provider", async () => {
  const fixture = setup();
  let release = (_stream: typeof fixture.stream) => {};
  fixture.getUserMedia.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const start = fixture.conversation.start();
  await fixture.conversation.stop();
  release(fixture.stream);
  await start;
  expect(fixture.input.stop).toHaveBeenCalledOnce();
  expect(fixture.fetch).not.toHaveBeenCalled();
});

test.each([0, 1] as const)(
  "identifies the unfinished connection after the other session is ready: %s",
  async (readyConnection) => {
    vi.useFakeTimers();
    const fixture = setup();
    await fixture.conversation.start();
    fixture.emit(readyConnection, {
      type: readyConnection === 0 ? "session.started" : "session.created",
    });
    await vi.advanceTimersByTimeAsync(15_000);
    const message = fixture.onState.mock.lastCall?.[0].message;
    expect(message).toContain(
      readyConnection === 0
        ? "transcription: waiting for session.created"
        : "live: waiting for session.started",
    );
    expect(message).not.toContain(
      readyConnection === 0 ? "live: waiting" : "transcription: waiting",
    );
    expect(fixture.fetch).toHaveBeenCalledTimes(2);
  },
);

test("reports the failed endpoint and HTTP statuses without reflecting response content", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const fixture = setup();
  fixture.fetch.mockImplementation(async (url) =>
    url.endsWith("live-session")
      ? new Response("sensitive provider response", {
          status: 502,
          headers: { "x-voice-upstream-status": "401" },
        })
      : new Promise<Response>(() => {}),
  );
  await fixture.conversation.start();
  expect(fixture.onState.mock.lastCall?.[0].phase).toBe("error");
  expect(fixture.onState.mock.lastCall?.[0].message).toContain(
    "live session request failed (HTTP 502, provider HTTP 401)",
  );
  expect(fixture.onState.mock.lastCall?.[0].message).not.toContain("sensitive");
  expect(warning).toHaveBeenCalledExactlyOnceWith(
    "[Petrinaut Live]",
    "live session request failed (HTTP 502, provider HTTP 401). No automatic retry was made.",
  );
  expect(fixture.input.stop).toHaveBeenCalledOnce();
  expect(
    fixture.peers.every((peer) => peer.close.mock.calls.length === 1),
  ).toBe(true);
});

test("timeout identifies a pending transcription HTTP response rather than blaming microphone permission", async () => {
  vi.useFakeTimers();
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const fixture = setup();
  fixture.fetch.mockImplementation(async (url) =>
    url.endsWith("transcription-session")
      ? new Promise<Response>(() => {})
      : Response.json({ sdp: "v=0\r\no=answer" }),
  );
  void fixture.conversation.start();
  await vi.advanceTimersByTimeAsync(15_000);
  expect(fixture.onState.mock.lastCall?.[0].message).toContain(
    "transcription: waiting for session HTTP response",
  );
  expect(warning).toHaveBeenCalledExactlyOnceWith(
    "[Petrinaut Live]",
    expect.stringContaining("transcription: waiting for session HTTP response"),
  );
  expect(fixture.input.stop).toHaveBeenCalledOnce();
});

test("both connection timeout and unconfirmed closure remain bounded without retry", async () => {
  vi.useFakeTimers();
  const timedOut = setup();
  await timedOut.conversation.start();
  await vi.advanceTimersByTimeAsync(15_000);
  expect(timedOut.onState.mock.lastCall?.[0].phase).toBe("error");
  expect(timedOut.onState.mock.lastCall?.[0].message).toContain("timed out");
  expect(timedOut.fetch).toHaveBeenCalledTimes(2);
  const fixture = setup();
  await connect(fixture);
  const stop = fixture.conversation.stop();
  await vi.advanceTimersByTimeAsync(2_000);
  await stop;
  expect(fixture.onState.mock.lastCall?.[0].message).toContain("not confirmed");
  expect(fixture.fetch).toHaveBeenCalledTimes(2);
});

test("microphone loss shuts both transports and does not expose provider error text", async () => {
  const fixture = setup();
  await connect(fixture);
  fixture.input.dispatchEvent(new Event("ended"));
  fixture.emit(0, { type: "error", error: { message: "secret" } });
  expect(fixture.audio.muted).toBe(true);
  fixture.emit(0, { type: "session.closed" });
  expect(fixture.onState.mock.lastCall?.[0].phase).toBe("error");
  expect(fixture.onState.mock.lastCall?.[0].message).toContain(
    "Microphone disconnected",
  );
  expect(fixture.onState.mock.lastCall?.[0].message).not.toContain("secret");
  expect(fixture.getUserMedia).toHaveBeenCalledOnce();
});

test("telemetry shows activity but silence and late samples never settle or revive speech", async () => {
  vi.useFakeTimers();
  const fixture = setup();
  const getStats = vi.fn(
    async (): Promise<Map<string, unknown>> =>
      new Map([
        ["input", { type: "media-source", kind: "audio", audioLevel: 0.24 }],
        ["output", { type: "inbound-rtp", kind: "audio", audioLevel: 0.2 }],
      ]),
  );
  Object.assign(fixture.peers[0]!, { getStats });
  await connect(fixture);
  fixture.peers[0]!.dispatchEvent(
    Object.assign(new Event("track"), {
      track: fixture.outputs[0],
      streams: [fixture.stream],
    }),
  );
  await vi.advanceTimersByTimeAsync(100);
  expect(fixture.onState.mock.lastCall?.[0].activity).toEqual({
    microphoneLevel: 0.24,
    outputActive: true,
  });
  getStats.mockResolvedValue(new Map());
  await vi.advanceTimersByTimeAsync(500);
  expect(fixture.onState.mock.lastCall?.[0].activity?.outputActive).toBe(false);
  expect(fixture.onFinalizedInput).not.toHaveBeenCalled();
  getStats.mockRejectedValueOnce(new Error("Optional telemetry failed"));
  await vi.advanceTimersByTimeAsync(100);
  expect(fixture.input.stop).not.toHaveBeenCalled();
  let release = (_stats: Map<string, unknown>) => {};
  getStats.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await vi.advanceTimersByTimeAsync(100);
  const stop = fixture.conversation.stop();
  fixture.emit(0, { type: "session.closed" });
  await stop;
  const calls = fixture.onState.mock.calls.length;
  release(new Map());
  await vi.advanceTimersByTimeAsync(500);
  expect(fixture.onState).toHaveBeenCalledTimes(calls);
});
