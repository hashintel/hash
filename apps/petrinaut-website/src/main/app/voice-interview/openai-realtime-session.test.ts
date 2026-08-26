import { afterEach, describe, expect, test, vi } from "vitest";

import {
  OpenAIRealtimeSession,
  type OpenAIRealtimeSessionEvent,
} from "./openai-realtime-session";

class FakeDataChannel extends EventTarget {
  public readyState: RTCDataChannelState = "connecting";

  public readonly close = vi.fn(() => {
    this.readyState = "closed";
  });

  public open() {
    this.readyState = "open";
    this.dispatchEvent(new Event("open"));
  }

  public receive(payload: unknown) {
    const event = new Event("message");
    Object.defineProperty(event, "data", {
      value: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
    this.dispatchEvent(event);
  }
}

const createHarness = () => {
  const channels: FakeDataChannel[] = [];
  const peers: Array<{
    addTrack: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    connectionState: RTCPeerConnectionState;
    createDataChannel: ReturnType<typeof vi.fn>;
    createOffer: ReturnType<typeof vi.fn>;
    onconnectionstatechange: (() => void) | null;
    setLocalDescription: ReturnType<typeof vi.fn>;
    setRemoteDescription: ReturnType<typeof vi.fn<() => Promise<void>>>;
  }> = [];
  const tracks: Array<{ enabled: boolean; stop: ReturnType<typeof vi.fn> }> =
    [];
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response("v=0\r\no=OpenAI answer", {
        headers: { "content-type": "application/sdp" },
      }),
  );
  const getUserMedia = vi.fn(async () => {
    const track = { enabled: true, stop: vi.fn() };
    tracks.push(track);
    return {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;
  });
  const createPeerConnection = () => {
    const channel = new FakeDataChannel();
    channels.push(channel);
    const peer = {
      addTrack: vi.fn(),
      close: vi.fn(),
      connectionState: "new" as RTCPeerConnectionState,
      createDataChannel: vi.fn(() => channel),
      createOffer: vi.fn(async () => ({
        type: "offer",
        sdp: "v=0\r\no=browser offer",
      })),
      onconnectionstatechange: null as (() => void) | null,
      setLocalDescription: vi.fn(async () => undefined),
      setRemoteDescription: vi.fn(async () => {
        channel.open();
      }),
    };
    peers.push(peer);
    return peer as unknown as RTCPeerConnection;
  };
  const session = new OpenAIRealtimeSession({
    connectionTimeoutMs: 15_000,
    createPeerConnection,
    fetch,
    getUserMedia,
  });
  const events: OpenAIRealtimeSessionEvent[] = [];
  session.subscribe((event) => events.push(event));

  return { channels, events, fetch, getUserMedia, peers, session, tracks };
};

describe("OpenAIRealtimeSession", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("negotiates through the app server and starts with the microphone closed", async () => {
    const harness = createHarness();

    await expect(harness.session.connect()).resolves.toBe(1);

    expect(harness.getUserMedia).toHaveBeenCalledWith({
      audio: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    expect(harness.tracks[0]!.enabled).toBe(false);
    expect(harness.fetch).toHaveBeenCalledWith(
      "/api/voice/realtime-call",
      expect.objectContaining({
        body: "v=0\r\no=browser offer",
        headers: { "content-type": "application/sdp" },
        method: "POST",
      }),
    );
    expect(JSON.stringify(harness.fetch.mock.calls)).not.toContain(
      "authorization",
    );
    expect(harness.peers[0]!.setRemoteDescription).toHaveBeenCalledWith({
      sdp: "v=0\r\no=OpenAI answer",
      type: "answer",
    });

    harness.session.setMicrophoneEnabled(true);
    expect(harness.tracks[0]!.enabled).toBe(true);
  });

  test("emits only strict input transcription events with stable source identity", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);

    harness.channels[0]!.receive("not-json");
    harness.channels[0]!.receive({ type: "response.created" });
    harness.channels[0]!.receive({
      type: "conversation.item.input_audio_transcription.delta",
      item_id: "item-a",
      content_index: "0",
      delta: "ignored",
    });
    harness.channels[0]!.receive({
      type: "conversation.item.input_audio_transcription.delta",
      item_id: "item-a",
      content_index: 0,
      delta: "The support lead",
    });
    harness.channels[0]!.receive({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item-a",
      content_index: 0,
      transcript: "The support lead triages it.",
    });

    expect(harness.events).toEqual([
      {
        key: { connectionEpoch: 1, contentIndex: 0, itemId: "item-a" },
        text: "The support lead",
        type: "partial",
      },
      {
        key: { connectionEpoch: 1, contentIndex: 0, itemId: "item-a" },
        text: "The support lead triages it.",
        type: "completed",
      },
    ]);
    expect(harness.tracks[0]!.enabled).toBe(false);
  });

  test("closes the microphone when semantic VAD commits an input item", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);

    harness.channels[0]!.receive({
      type: "input_audio_buffer.committed",
      item_id: "item-a",
    });

    expect(harness.tracks[0]!.enabled).toBe(false);
    expect(harness.events).toEqual([
      { connectionEpoch: 1, itemId: "item-a", type: "input-committed" },
    ]);
  });

  test("disposes all WebRTC resources and rejects stale events after reconnect", async () => {
    const harness = createHarness();
    await harness.session.connect();
    const firstChannel = harness.channels[0]!;

    await expect(harness.session.connect()).resolves.toBe(2);

    expect(harness.tracks[0]!.stop).toHaveBeenCalledOnce();
    expect(firstChannel.close).toHaveBeenCalledOnce();
    expect(harness.peers[0]!.close).toHaveBeenCalledOnce();
    firstChannel.receive({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "stale-item",
      content_index: 0,
      transcript: "Stale transcript",
    });
    expect(harness.events).toEqual([]);

    await harness.session.disconnect();
    expect(harness.tracks[1]!.stop).toHaveBeenCalledOnce();
    expect(harness.channels[1]!.close).toHaveBeenCalledOnce();
    expect(harness.peers[1]!.close).toHaveBeenCalledOnce();
  });

  test("reports microphone permission denial without leaking browser diagnostics", async () => {
    const harness = createHarness();
    harness.getUserMedia.mockRejectedValueOnce(
      new DOMException("private browser detail", "NotAllowedError"),
    );

    await expect(harness.session.connect()).rejects.toThrow(
      "Microphone access is required to start voice input.",
    );
  });

  test("times out startup and cleans up resources", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    harness.fetch.mockImplementationOnce(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );

    const connection = expect(harness.session.connect()).rejects.toThrow(
      "The voice connection timed out. Try reconnecting.",
    );
    await vi.advanceTimersByTimeAsync(15_000);

    await connection;
    expect(harness.tracks[0]!.stop).toHaveBeenCalledOnce();
    expect(harness.channels[0]!.close).toHaveBeenCalledOnce();
    expect(harness.peers[0]!.close).toHaveBeenCalledOnce();
  });

  test("times out a stalled permission prompt and stops a late media stream", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const lateTrack = { enabled: true, stop: vi.fn() };
    const lateStream = {
      getAudioTracks: () => [lateTrack],
      getTracks: () => [lateTrack],
    } as unknown as MediaStream;
    let resolveMedia: ((stream: MediaStream) => void) | undefined;
    harness.getUserMedia.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMedia = resolve;
        }),
    );
    let settled = false;
    const connection = harness.session.connect().then(
      () => new Error("Connection unexpectedly succeeded."),
      (error: unknown) => {
        settled = true;
        return error;
      },
    );

    await vi.advanceTimersByTimeAsync(15_000);
    const settledAtTimeout = settled;
    resolveMedia?.(lateStream);
    const error = await connection;

    expect(settledAtTimeout).toBe(true);
    expect(error).toEqual(
      new Error("The voice connection timed out. Try reconnecting."),
    );
    expect(lateTrack.stop).toHaveBeenCalledOnce();
  });

  test("closes the microphone and emits a recoverable connection error", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);

    harness.peers[0]!.connectionState = "failed";
    harness.peers[0]!.onconnectionstatechange?.();

    expect(harness.tracks[0]!.enabled).toBe(false);
    expect(harness.tracks[0]!.stop).toHaveBeenCalledOnce();
    expect(harness.channels[0]!.close).toHaveBeenCalledOnce();
    expect(harness.peers[0]!.close).toHaveBeenCalledOnce();
    expect(harness.events).toEqual([
      {
        message: "The voice connection failed. Try reconnecting.",
        type: "error",
      },
    ]);
  });
});
