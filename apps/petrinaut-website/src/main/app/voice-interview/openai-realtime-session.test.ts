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
  let requestNumber = 0;
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
  const reportDiagnostic = vi.fn();
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
    createRequestId: () => `voice-request-${++requestNumber}`,
    createPeerConnection,
    fetch,
    getUserMedia,
    now: () => 100,
    reportDiagnostic,
  });
  const events: OpenAIRealtimeSessionEvent[] = [];
  session.subscribe((event) => events.push(event));

  return {
    channels,
    events,
    fetch,
    getUserMedia,
    peers,
    reportDiagnostic,
    session,
    tracks,
  };
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
        headers: {
          "content-type": "application/sdp",
          "x-request-id": "voice-request-1",
        },
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
    expect(harness.reportDiagnostic).toHaveBeenCalledWith({
      durationMs: 0,
      operation: "connection",
      outcome: "success",
      requestId: "voice-request-1",
      stage: "browser",
    });
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
    expect(harness.reportDiagnostic).toHaveBeenLastCalledWith({
      durationMs: 0,
      operation: "transcription",
      outcome: "success",
      requestId: "voice-request-2",
      stage: "browser",
    });
  });

  test("surfaces failed input transcription as a recoverable error", async () => {
    const harness = createHarness();
    await harness.session.connect();

    harness.channels[0]!.receive({
      type: "conversation.item.input_audio_transcription.failed",
      item_id: "item-a",
      content_index: 0,
      error: { message: "private provider diagnostic" },
    });

    expect(harness.events).toEqual([
      {
        code: "invalid-response",
        message:
          "The transcription service returned an invalid response. Try again; if it continues, give the diagnostic reference to an operator.",
        requestId: "voice-request-1",
        type: "error",
      },
    ]);
    expect(JSON.stringify(harness.events)).not.toContain(
      "private provider diagnostic",
    );
    expect(harness.tracks[0]!.stop).toHaveBeenCalledOnce();
    expect(harness.channels[0]!.close).toHaveBeenCalledOnce();
    expect(harness.peers[0]!.close).toHaveBeenCalledOnce();
    expect(harness.reportDiagnostic).toHaveBeenLastCalledWith({
      durationMs: 0,
      errorCode: "invalid-response",
      operation: "transcription",
      outcome: "failure",
      requestId: "voice-request-1",
      stage: "browser",
    });
  });

  test("surfaces OpenAI data-channel errors without exposing diagnostics", async () => {
    const harness = createHarness();
    await harness.session.connect();

    harness.channels[0]!.receive({
      type: "error",
      error: { message: "private provider diagnostic" },
    });

    expect(harness.events).toEqual([
      {
        code: "invalid-response",
        message:
          "The transcription service returned an invalid response. Try again; if it continues, give the diagnostic reference to an operator.",
        requestId: "voice-request-1",
        type: "error",
      },
    ]);
    expect(JSON.stringify(harness.events)).not.toContain(
      "private provider diagnostic",
    );
    expect(harness.tracks[0]!.stop).toHaveBeenCalledOnce();
    expect(harness.channels[0]!.close).toHaveBeenCalledOnce();
    expect(harness.peers[0]!.close).toHaveBeenCalledOnce();
  });

  test("closes the microphone when VAD commits an input item", async () => {
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
      "Allow microphone access in your browser settings, then reconnect voice input.",
    );
    expect(harness.reportDiagnostic).toHaveBeenCalledWith({
      durationMs: 0,
      errorCode: "microphone-permission",
      operation: "connection",
      outcome: "failure",
      requestId: "voice-request-1",
      stage: "browser",
    });
  });

  test("distinguishes microphone device failures from permission denial", async () => {
    const harness = createHarness();
    harness.getUserMedia.mockRejectedValueOnce(
      new DOMException("private device detail", "NotFoundError"),
    );

    await expect(harness.session.connect()).rejects.toMatchObject({
      code: "microphone-device",
      message:
        "No usable microphone was found. Connect or select one, then reconnect voice input.",
      requestId: "voice-request-1",
    });
    expect(JSON.stringify(harness.reportDiagnostic.mock.calls)).not.toContain(
      "private device detail",
    );
  });

  test("classifies browser network failures without exposing thrown details", async () => {
    const harness = createHarness();
    harness.fetch.mockRejectedValueOnce(
      new Error("private SDP and credential diagnostics"),
    );

    await expect(harness.session.connect()).rejects.toMatchObject({
      code: "network",
      message:
        "The voice connection could not be reached. Check your connection, then reconnect voice input.",
      requestId: "voice-request-1",
    });
    expect(harness.tracks[0]!.stop).toHaveBeenCalledOnce();
    expect(JSON.stringify(harness.reportDiagnostic.mock.calls)).not.toContain(
      "private SDP and credential diagnostics",
    );
  });

  test("classifies a data channel that closes during startup as a network failure", async () => {
    const harness = createHarness();
    let resolveFetch: ((response: Response) => void) | undefined;
    harness.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const connection = harness.session.connect();
    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledOnce());
    harness.peers[0]!.setRemoteDescription.mockResolvedValueOnce(undefined);
    resolveFetch?.(
      new Response("v=0\r\no=OpenAI answer", {
        headers: { "content-type": "application/sdp" },
      }),
    );
    await vi.waitFor(() =>
      expect(harness.peers[0]?.setRemoteDescription).toHaveBeenCalledOnce(),
    );
    await Promise.resolve();

    harness.channels[0]!.dispatchEvent(new Event("close"));

    await expect(connection).rejects.toMatchObject({
      code: "network",
      requestId: "voice-request-1",
    });
    expect(harness.tracks[0]!.stop).toHaveBeenCalledOnce();
    expect(harness.channels[0]!.close).toHaveBeenCalledOnce();
    expect(harness.peers[0]!.close).toHaveBeenCalledOnce();
  });

  test("sanitizes unexpected browser startup failures", async () => {
    const harness = createHarness();
    let resolveFetch: ((response: Response) => void) | undefined;
    harness.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const connection = harness.session.connect();
    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledOnce());
    harness.peers[0]!.setRemoteDescription.mockRejectedValueOnce(
      new Error("private browser and SDP diagnostics"),
    );
    resolveFetch?.(
      new Response("v=0\r\no=private provider answer", {
        headers: { "content-type": "application/sdp" },
      }),
    );

    await expect(connection).rejects.toMatchObject({
      code: "invalid-response",
      message:
        "The voice connection returned an invalid response. Try again; if it continues, give the diagnostic reference to an operator.",
      requestId: "voice-request-1",
    });
    expect(JSON.stringify(harness.reportDiagnostic.mock.calls)).not.toContain(
      "private browser and SDP diagnostics",
    );
  });

  test("surfaces disabled voice as unavailable without reading the response body", async () => {
    const harness = createHarness();
    const serverRequestId = "00000000-0000-4000-8000-000000000021";
    harness.fetch.mockResolvedValueOnce(
      new Response("private provider response", {
        headers: {
          "x-petrinaut-voice-error": "unavailable",
          "x-request-id": serverRequestId,
        },
        status: 404,
      }),
    );

    await expect(harness.session.connect()).rejects.toMatchObject({
      code: "unavailable",
      requestId: serverRequestId,
    });
    expect(JSON.stringify(harness.reportDiagnostic.mock.calls)).not.toContain(
      "private provider response",
    );
  });

  test("classifies an explicit startup abort and cleans media resources", async () => {
    const harness = createHarness();
    harness.fetch.mockImplementationOnce(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("private abort detail", "AbortError")),
          );
        }),
    );

    const connection = harness.session
      .connect()
      .catch((error: unknown) => error);
    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledOnce());
    await harness.session.disconnect();

    await expect(connection).resolves.toMatchObject({
      code: "request-aborted",
      requestId: "voice-request-1",
    });
    expect(harness.tracks[0]!.stop).toHaveBeenCalledOnce();
    expect(harness.channels[0]!.close).toHaveBeenCalledOnce();
    expect(harness.peers[0]!.close).toHaveBeenCalledOnce();
  });

  test("classifies disconnect while reading the SDP answer as aborted", async () => {
    const harness = createHarness();
    let rejectAnswerRead: ((reason?: unknown) => void) | undefined;
    harness.fetch.mockResolvedValueOnce({
      headers: new Headers({ "content-type": "application/sdp" }),
      ok: true,
      text: () =>
        new Promise<string>((_resolve, reject) => {
          rejectAnswerRead = reject;
        }),
    } as Response);
    const connection = harness.session
      .connect()
      .catch((error: unknown) => error);
    await vi.waitFor(() => expect(rejectAnswerRead).toBeTypeOf("function"));

    await harness.session.disconnect();
    rejectAnswerRead?.(new Error("private response read failure"));

    await expect(connection).resolves.toMatchObject({
      code: "request-aborted",
      requestId: "voice-request-1",
    });
    expect(harness.reportDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "request-aborted",
        outcome: "aborted",
      }),
    );
  });

  test("classifies disconnect while applying the SDP answer as aborted", async () => {
    const harness = createHarness();
    let resolveFetch: ((response: Response) => void) | undefined;
    let rejectRemoteDescription: ((reason?: unknown) => void) | undefined;
    harness.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const connection = harness.session
      .connect()
      .catch((error: unknown) => error);
    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledOnce());
    const remoteDescription = new Promise<void>((_resolve, reject) => {
      rejectRemoteDescription = reject;
    });
    harness.peers[0]!.setRemoteDescription.mockReturnValueOnce(
      remoteDescription,
    );
    resolveFetch?.(
      new Response("v=0\r\no=OpenAI answer", {
        headers: { "content-type": "application/sdp" },
      }),
    );
    await vi.waitFor(() =>
      expect(harness.peers[0]!.setRemoteDescription).toHaveBeenCalledOnce(),
    );

    await harness.session.disconnect();
    rejectRemoteDescription?.(new Error("private SDP application failure"));

    await expect(connection).resolves.toMatchObject({
      code: "request-aborted",
      requestId: "voice-request-1",
    });
    expect(harness.reportDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "request-aborted",
        outcome: "aborted",
      }),
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
      "The voice connection timed out. Check your connection, then reconnect voice input.",
    );
    await vi.advanceTimersByTimeAsync(15_000);

    await connection;
    expect(harness.tracks[0]!.stop).toHaveBeenCalledOnce();
    expect(harness.channels[0]!.close).toHaveBeenCalledOnce();
    expect(harness.peers[0]!.close).toHaveBeenCalledOnce();
    expect(harness.reportDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "timeout",
        outcome: "failure",
        requestId: "voice-request-1",
      }),
    );
  });

  test("times out when abort occurs before waiting for the data channel", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    let resolveAnswer: ((answer: string) => void) | undefined;
    harness.fetch.mockResolvedValueOnce({
      headers: new Headers({ "content-type": "application/sdp" }),
      ok: true,
      text: () =>
        new Promise<string>((resolve) => {
          resolveAnswer = resolve;
        }),
    } as Response);
    let settled = false;
    const connection = harness.session.connect().then(
      () => new Error("Connection unexpectedly succeeded."),
      (error: unknown) => {
        settled = true;
        return error;
      },
    );
    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledOnce());
    harness.peers[0]!.setRemoteDescription.mockResolvedValueOnce(undefined);

    await vi.advanceTimersByTimeAsync(15_000);
    resolveAnswer?.("v=0\r\no=late OpenAI answer");

    await vi.waitFor(() => expect(settled).toBe(true));
    await expect(connection).resolves.toMatchObject({
      code: "timeout",
      message:
        "The voice connection timed out. Check your connection, then reconnect voice input.",
      requestId: "voice-request-1",
    });
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
    expect(error).toMatchObject({
      code: "timeout",
      message:
        "The voice connection timed out. Check your connection, then reconnect voice input.",
      requestId: "voice-request-1",
    });
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
        code: "network",
        message:
          "The voice connection could not be reached. Check your connection, then reconnect voice input.",
        requestId: "voice-request-1",
        type: "error",
      },
    ]);
    expect(harness.reportDiagnostic).toHaveBeenLastCalledWith({
      durationMs: 0,
      errorCode: "network",
      operation: "connection",
      outcome: "failure",
      requestId: "voice-request-1",
      stage: "browser",
    });
  });

  test("fails closed on a malformed completed provider transcript", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);

    harness.channels[0]!.receive({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item-a",
      content_index: 0,
      transcript: { private: "provider response body" },
    });

    expect(harness.tracks[0]!.stop).toHaveBeenCalledOnce();
    expect(harness.events).toEqual([
      {
        code: "invalid-response",
        message:
          "The transcription service returned an invalid response. Try again; if it continues, give the diagnostic reference to an operator.",
        requestId: "voice-request-2",
        type: "error",
      },
    ]);
    expect(harness.reportDiagnostic).toHaveBeenLastCalledWith({
      durationMs: 0,
      errorCode: "invalid-response",
      operation: "transcription",
      outcome: "failure",
      requestId: "voice-request-2",
      stage: "browser",
    });
    expect(JSON.stringify(harness.reportDiagnostic.mock.calls)).not.toContain(
      "provider response body",
    );
  });
});
