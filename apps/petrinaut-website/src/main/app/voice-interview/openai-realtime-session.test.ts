import { afterEach, describe, expect, test, vi } from "vitest";

import {
  OpenAIRealtimeSession,
  type OpenAIRealtimeSessionEvent,
} from "./openai-realtime-session";

import type { CanonicalSpeechSegment } from "./canonical-speech";

class FakeDataChannel extends EventTarget {
  public readyState: RTCDataChannelState = "connecting";
  public readonly close = vi.fn(() => {
    this.readyState = "closed";
  });
  public readonly send = vi.fn();

  public open(): void {
    this.readyState = "open";
    this.dispatchEvent(new Event("open"));
  }

  public receive(payload: unknown): void {
    const event = new Event("message");
    Object.defineProperty(event, "data", {
      value: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
    this.dispatchEvent(event);
  }
}

const canonicalSegment = (
  id: string,
  text: string,
): CanonicalSpeechSegment => ({
  contentHash: "fnv1a32:12345678",
  id,
  messageId: `message-${id}`,
  partId: id,
  source: "brunch-ask",
  text,
});

const createHarness = ({
  connectionTimeoutMs = 15_000,
}: {
  readonly connectionTimeoutMs?: number;
} = {}) => {
  let requestNumber = 0;
  const channels: FakeDataChannel[] = [];
  const localTracks: Array<{
    enabled: boolean;
    kind: string;
    stop: ReturnType<typeof vi.fn>;
  }> = [];
  const remoteAudios: Array<{
    autoplay: boolean;
    pause: ReturnType<typeof vi.fn>;
    play: ReturnType<typeof vi.fn>;
    srcObject: MediaStream | null;
  }> = [];
  const peers: Array<{
    addTrack: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    connectionState: RTCPeerConnectionState;
    createDataChannel: ReturnType<typeof vi.fn>;
    createOffer: ReturnType<typeof vi.fn>;
    onconnectionstatechange: (() => void) | null;
    ontrack: ((event: RTCTrackEvent) => void) | null;
    setLocalDescription: ReturnType<typeof vi.fn>;
    setRemoteDescription: ReturnType<typeof vi.fn<() => Promise<void>>>;
  }> = [];
  const getUserMedia = vi.fn(async () => {
    const track = { enabled: true, kind: "audio", stop: vi.fn() };
    localTracks.push(track);
    return {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;
  });
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response("v=0\r\no=OpenAI answer", {
        headers: { "content-type": "application/sdp" },
      }),
  );
  const reportDiagnostic = vi.fn();
  const session = new OpenAIRealtimeSession({
    cancelAnimationFrame: vi.fn(),
    connectionTimeoutMs,
    createAudioContext: () =>
      ({
        close: vi.fn(async () => undefined),
        createAnalyser: vi.fn(() => ({
          fftSize: 0,
          getByteTimeDomainData: vi.fn((samples: Uint8Array) =>
            samples.fill(140),
          ),
        })),
        createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
        resume: vi.fn(async () => undefined),
        state: "running",
      }) as unknown as AudioContext,
    createPeerConnection: () => {
      const channel = new FakeDataChannel();
      channels.push(channel);
      const peer = {
        addTrack: vi.fn(),
        close: vi.fn(),
        connectionState: "new" as RTCPeerConnectionState,
        createDataChannel: vi.fn(() => channel),
        createOffer: vi.fn(async () => ({
          sdp: "v=0\r\no=browser offer",
          type: "offer" as RTCSdpType,
        })),
        onconnectionstatechange: null as (() => void) | null,
        ontrack: null as ((event: RTCTrackEvent) => void) | null,
        setLocalDescription: vi.fn(async () => undefined),
        setRemoteDescription: vi.fn(async () => channel.open()),
      };
      peers.push(peer);
      return peer as unknown as RTCPeerConnection;
    },
    createRemoteAudio: () => {
      const audio = {
        autoplay: false,
        pause: vi.fn(),
        play: vi.fn(async () => undefined),
        srcObject: null as MediaStream | null,
      };
      remoteAudios.push(audio);
      return audio;
    },
    createRequestId: () => `voice-request-${++requestNumber}`,
    fetch,
    getUserMedia,
    now: () => 100,
    reportDiagnostic,
    requestAnimationFrame: vi.fn(() => 1),
  });
  const events: OpenAIRealtimeSessionEvent[] = [];
  session.subscribe((event) => events.push(event));

  return {
    channels,
    events,
    fetch,
    getUserMedia,
    localTracks,
    peers,
    remoteAudios,
    reportDiagnostic,
    session,
  };
};

const sentEvents = (channel: FakeDataChannel): Record<string, unknown>[] =>
  channel.send.mock.calls.map(([payload]) => JSON.parse(payload as string));

const authorizeLatestSpeechResponse = (
  channel: FakeDataChannel,
  responseId: string,
): void => {
  const responseCreate = sentEvents(channel).findLast(
    ({ type }) => type === "response.create",
  )!;
  const response = responseCreate.response as Record<string, unknown>;
  channel.receive({
    type: "response.created",
    response: { id: responseId, metadata: response.metadata },
  });
};

describe("OpenAIRealtimeSession", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("negotiates duplex WebRTC, attaches remote audio, and cleans all media", async () => {
    const harness = createHarness();

    await expect(harness.session.connect()).resolves.toBe(1);

    expect(harness.getUserMedia).toHaveBeenCalledWith({
      audio: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    expect(harness.localTracks[0]!.enabled).toBe(false);
    expect(harness.fetch).toHaveBeenCalledWith(
      "/api/voice/realtime-call",
      expect.objectContaining({
        body: "v=0\r\no=browser offer",
        method: "POST",
      }),
    );
    expect(JSON.stringify(harness.fetch.mock.calls)).not.toContain(
      "authorization",
    );

    const remoteTrack = { kind: "audio", stop: vi.fn() };
    const remoteStream = {
      getTracks: () => [remoteTrack],
    } as unknown as MediaStream;
    harness.peers[0]!.ontrack?.({
      streams: [remoteStream],
      track: remoteTrack,
    } as unknown as RTCTrackEvent);
    expect(harness.remoteAudios[0]).toMatchObject({
      autoplay: true,
      srcObject: remoteStream,
    });
    expect(harness.remoteAudios[0]!.play).toHaveBeenCalledOnce();

    await harness.session.disconnect();
    expect(harness.remoteAudios[0]!.pause).toHaveBeenCalledOnce();
    expect(harness.remoteAudios[0]!.srcObject).toBeNull();
    expect(remoteTrack.stop).toHaveBeenCalledOnce();
    expect(harness.localTracks[0]!.stop).toHaveBeenCalledOnce();
    expect(harness.peers[0]!.close).toHaveBeenCalledOnce();
  });

  test("keeps the microphone active through playback and reports automatic interruption", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);
    harness.session.speakCanonical([
      canonicalSegment("ask-1", "What happens next?"),
    ]);
    const channel = harness.channels[0]!;
    authorizeLatestSpeechResponse(channel, "response-canonical");

    channel.receive({
      event_id: "event-1",
      response_id: "response-canonical",
      type: "output_audio_buffer.started",
    });
    channel.receive({
      audio_start_ms: 120,
      event_id: "event-2",
      item_id: "item-user",
      type: "input_audio_buffer.speech_started",
    });

    expect(harness.localTracks[0]!.enabled).toBe(true);
    expect(harness.events).toEqual(
      expect.arrayContaining([
        {
          connectionEpoch: 1,
          responseId: "response-canonical",
          speechRequestId: "canonical-1-1",
          type: "output-started",
        },
        {
          connectionEpoch: 1,
          itemId: "item-user",
          type: "input-speech-started",
        },
        {
          connectionEpoch: 1,
          responseId: "response-canonical",
          type: "output-interrupted",
        },
      ]),
    );
  });

  test("parses streamed tool arguments and the completed GA response output", async () => {
    const harness = createHarness();
    await harness.session.connect();
    const channel = harness.channels[0]!;

    channel.receive({
      arguments: '{"answer":"Ignored"}',
      call_id: "call-ignored",
      item_id: "item-ignored",
      output_index: 0,
      response_id: "response-tool",
      type: "response.function_call_arguments.done",
    });
    channel.receive({
      call_id: "call-1",
      delta: '{"answer":"Approved"}',
      item_id: "item-function",
      output_index: 0,
      response_id: "response-tool",
      type: "response.function_call_arguments.delta",
    });
    channel.receive({
      response: {
        id: "response-tool",
        output: [
          {
            arguments: '{"answer":"Approved"}',
            call_id: "call-1",
            id: "item-function",
            name: "continue_interview",
            type: "function_call",
          },
        ],
        status: "completed",
      },
      type: "response.done",
    });

    expect(harness.events).toEqual([
      {
        callId: "call-1",
        connectionEpoch: 1,
        delta: '{"answer":"Approved"}',
        itemId: "item-function",
        responseId: "response-tool",
        type: "tool-arguments-delta",
      },
      {
        arguments: '{"answer":"Approved"}',
        callId: "call-1",
        connectionEpoch: 1,
        itemId: "item-function",
        name: "continue_interview",
        responseId: "response-tool",
        type: "tool-arguments-done",
      },
      {
        connectionEpoch: 1,
        responseId: "response-tool",
        status: "completed",
        type: "response-terminal",
      },
    ]);

    harness.session.completeFunctionCall("call-1", [
      canonicalSegment("ask-2", "Who acts next?"),
    ]);
    const [functionOutput, responseCreate] = sentEvents(channel).slice(-2);
    expect(functionOutput).toEqual({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: "call-1",
        output: JSON.stringify({ response_text: ["Who acts next?"] }),
      },
    });
    expect(responseCreate).toMatchObject({
      type: "response.create",
      response: {
        instructions:
          "Speak only the response_text strings supplied by Petrinaut, in array order and verbatim. Deliver them as a warm, calm, curious, confident, concise, and professionally neutral expert interviewer, at a measured conversational pace with natural emphasis. Never sound robotic, fawning, rushed, overenthusiastic, or patronizing. Do not add, remove, paraphrase, acknowledge, or explain anything.",
        output_modalities: ["audio"],
        parallel_tool_calls: false,
        tool_choice: "none",
        tools: [],
      },
    });
  });

  test("closes a stopped function call without requesting speech", async () => {
    const harness = createHarness();
    await harness.session.connect();
    const channel = harness.channels[0]!;
    const sentBefore = sentEvents(channel).length;

    harness.session.completeFunctionCallWithoutResponse(
      "call-stopped",
      "aborted",
    );

    expect(sentEvents(channel).slice(sentBefore)).toEqual([
      {
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: "call-stopped",
          output: JSON.stringify({ response_text: [], outcome: "aborted" }),
        },
      },
    ]);
  });

  test("preserves exact canonical whitespace while rejecting blank speech", async () => {
    const harness = createHarness();
    await harness.session.connect();
    const channel = harness.channels[0]!;

    harness.session.completeFunctionCall("call-exact", [
      canonicalSegment("ask-exact", "  Exact Brunch text.\n"),
    ]);

    expect(sentEvents(channel)[0]).toEqual({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: "call-exact",
        output: JSON.stringify({
          response_text: ["  Exact Brunch text.\n"],
        }),
      },
    });
    const sentCount = sentEvents(channel).length;
    expect(() =>
      harness.session.speakCanonical([canonicalSegment("ask-blank", " \n\t")]),
    ).toThrow();
    expect(sentEvents(channel)).toHaveLength(sentCount);
  });

  test("queues canonical speech behind an active Realtime response", async () => {
    const harness = createHarness();
    await harness.session.connect();
    const channel = harness.channels[0]!;
    channel.receive({
      response: { id: "response-active" },
      type: "response.created",
    });

    harness.session.speakCanonical([
      canonicalSegment("question", "Canonical question"),
    ]);

    expect(sentEvents(channel)).toEqual([]);
    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: "canonical-speech-requested" }),
    );
    channel.receive({
      response: {
        id: "response-active",
        output: [],
        status: "completed",
      },
      type: "response.done",
    });

    expect(sentEvents(channel)).toHaveLength(1);
    expect(sentEvents(channel)[0]).toMatchObject({
      type: "response.create",
      response: {
        metadata: { petrinaut_kind: "canonical-speech" },
      },
    });
    expect(harness.events).toContainEqual({
      connectionEpoch: 1,
      speechRequestId: "canonical-1-1",
      type: "canonical-speech-requested",
    });
    expect(harness.events).toContainEqual({
      connectionEpoch: 1,
      responseId: "response-active",
      status: "completed",
      type: "response-terminal",
    });
  });

  test("cancels canonical speech before the response starts", async () => {
    const harness = createHarness();
    await harness.session.connect();
    const channel = harness.channels[0]!;
    harness.session.speakCanonical([
      canonicalSegment("question", "Canonical question"),
    ]);
    const responseCreate = sentEvents(channel)[0]!;

    harness.session.cancelOutput();

    expect(
      sentEvents(channel).filter(({ type }) => type === "response.cancel"),
    ).toEqual([]);

    channel.receive({
      response: {
        id: "response-canonical",
        metadata: (responseCreate.response as Record<string, unknown>).metadata,
      },
      type: "response.created",
    });

    expect(sentEvents(channel).slice(-2)).toEqual([
      expect.objectContaining({
        response_id: "response-canonical",
        type: "response.cancel",
      }),
      { type: "output_audio_buffer.clear" },
    ]);

    channel.receive({
      response_id: "response-canonical",
      type: "output_audio_buffer.started",
    });
    channel.receive({
      response: {
        id: "response-canonical",
        output: [],
        status: "cancelled",
      },
      type: "response.done",
    });

    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: "output-started" }),
    );
    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: "error" }),
    );
    expect(harness.localTracks[0]!.stop).not.toHaveBeenCalled();
  });

  test("retries a correlated canonical response after the active response ends", async () => {
    const harness = createHarness();
    await harness.session.connect();
    const channel = harness.channels[0]!;
    harness.session.speakCanonical([
      canonicalSegment("question", "Canonical question"),
    ]);
    const firstCreate = sentEvents(channel)[0]!;

    channel.receive({
      error: {
        code: "conversation_already_has_active_response",
        event_id: firstCreate.event_id,
        message: "private provider detail",
        type: "invalid_request_error",
      },
      type: "error",
    });
    channel.receive({
      response: { id: "response-active" },
      type: "response.created",
    });
    channel.receive({
      response: {
        id: "response-active",
        output: [],
        status: "completed",
      },
      type: "response.done",
    });

    const responseCreates = sentEvents(channel).filter(
      ({ type }) => type === "response.create",
    );
    expect(responseCreates).toHaveLength(2);
    expect(responseCreates[1]?.response).toEqual(firstCreate.response);
    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: "error" }),
    );
    expect(harness.localTracks[0]!.stop).not.toHaveBeenCalled();
  });

  test("retries canonical speech when the active response ends before the correlated error arrives", async () => {
    const harness = createHarness();
    await harness.session.connect();
    const channel = harness.channels[0]!;
    harness.session.speakCanonical([
      canonicalSegment("question", "Canonical question"),
    ]);
    const firstCreate = sentEvents(channel)[0]!;

    channel.receive({
      response: { id: "response-active" },
      type: "response.created",
    });
    channel.receive({
      response: {
        id: "response-active",
        output: [],
        status: "completed",
      },
      type: "response.done",
    });
    channel.receive({
      error: {
        code: "conversation_already_has_active_response",
        event_id: firstCreate.event_id,
        message: "private provider detail",
        type: "invalid_request_error",
      },
      type: "error",
    });

    const responseCreates = sentEvents(channel).filter(
      ({ type }) => type === "response.create",
    );
    expect(responseCreates).toHaveLength(2);
    expect(responseCreates[1]?.response).toEqual(firstCreate.response);
    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: "error" }),
    );
  });

  test("ignores a correlated cancel for an already-finished response", async () => {
    const harness = createHarness();
    await harness.session.connect();
    const channel = harness.channels[0]!;
    harness.session.speakCanonical([
      canonicalSegment("question", "Canonical question"),
    ]);
    const responseCreate = sentEvents(channel)[0]!;
    channel.receive({
      response: {
        id: "response-canonical",
        metadata: (responseCreate.response as Record<string, unknown>).metadata,
      },
      type: "response.created",
    });
    channel.receive({
      response_id: "response-canonical",
      type: "output_audio_buffer.started",
    });

    harness.session.cancelOutput();
    const cancelEvent = sentEvents(channel).findLast(
      ({ type }) => type === "response.cancel",
    )!;
    expect(cancelEvent).toMatchObject({
      response_id: "response-canonical",
      type: "response.cancel",
    });
    channel.receive({
      error: {
        code: "response_cancel_not_active",
        event_id: cancelEvent.event_id,
        message: "private provider detail",
        type: "invalid_request_error",
      },
      type: "error",
    });

    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: "error" }),
    );
    expect(harness.localTracks[0]!.stop).not.toHaveBeenCalled();
  });

  test("ignores a late correlated cancel error after response completion", async () => {
    const harness = createHarness();
    await harness.session.connect();
    const channel = harness.channels[0]!;
    harness.session.speakCanonical([
      canonicalSegment("question", "Canonical question"),
    ]);
    const responseCreate = sentEvents(channel)[0]!;
    channel.receive({
      response: {
        id: "response-canonical",
        metadata: (responseCreate.response as Record<string, unknown>).metadata,
      },
      type: "response.created",
    });
    channel.receive({
      response_id: "response-canonical",
      type: "output_audio_buffer.started",
    });

    harness.session.cancelOutput();
    const cancelEvent = sentEvents(channel).findLast(
      ({ type }) => type === "response.cancel",
    )!;
    channel.receive({
      response: {
        id: "response-canonical",
        output: [],
        status: "cancelled",
      },
      type: "response.done",
    });
    channel.receive({
      error: {
        code: "response_cancel_not_active",
        event_id: cancelEvent.event_id,
        message: "private provider detail",
        type: "invalid_request_error",
      },
      type: "error",
    });

    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: "error" }),
    );
    expect(harness.localTracks[0]!.stop).not.toHaveBeenCalled();
  });

  test("rejects malformed completed function calls without exposing provider data", async () => {
    const harness = createHarness();
    await harness.session.connect();

    harness.channels[0]!.receive({
      response: {
        id: "response-tool",
        output: [
          {
            arguments: { private: "provider arguments" },
            call_id: "call-1",
            id: "item-function",
            name: "continue_interview",
            type: "function_call",
          },
        ],
        status: "completed",
      },
      type: "response.done",
    });

    expect(harness.events.at(-1)).toMatchObject({
      code: "invalid-response",
      type: "error",
    });
    expect(JSON.stringify(harness.events)).not.toContain("provider arguments");
    expect(harness.localTracks[0]!.stop).toHaveBeenCalledOnce();
  });

  test("rejects multiple function calls before emitting either one", async () => {
    const harness = createHarness();
    await harness.session.connect();

    harness.channels[0]!.receive({
      response: {
        id: "response-tool",
        output: ["call-1", "call-2"].map((callId) => ({
          arguments: '{"answer":"Approved"}',
          call_id: callId,
          id: `item-${callId}`,
          name: "continue_interview",
          status: "completed",
          type: "function_call",
        })),
        status: "completed",
      },
      type: "response.done",
    });

    expect(harness.events).toEqual([
      expect.objectContaining({ code: "invalid-response", type: "error" }),
    ]);
  });

  test("rejects a tool call from a canonical speech response", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.speakCanonical([
      canonicalSegment("question", "Canonical question"),
    ]);
    const responseCreate = sentEvents(harness.channels[0]!).at(-1)!;
    const response = responseCreate.response as Record<string, unknown>;

    harness.channels[0]!.receive({
      response: {
        id: "response-canonical",
        metadata: response.metadata,
      },
      type: "response.created",
    });
    harness.channels[0]!.receive({
      response: {
        id: "response-canonical",
        output: [
          {
            arguments: '{"answer":"Invented overlap"}',
            call_id: "call-not-allowed",
            id: "function-item-1",
            name: "continue_interview",
            type: "function_call",
          },
        ],
        status: "completed",
      },
      type: "response.done",
    });

    expect(harness.events.at(-1)).toMatchObject({
      code: "invalid-response",
      type: "error",
    });
    expect(harness.peers[0]!.close).toHaveBeenCalledOnce();
  });

  test("treats transcripts as display-only and never closes capture", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);
    const channel = harness.channels[0]!;

    channel.receive({
      content_index: 0,
      delta: "The supervisor",
      item_id: "item-user",
      type: "conversation.item.input_audio_transcription.delta",
    });
    channel.receive({
      content_index: 0,
      item_id: "item-user",
      transcript: "The supervisor approves it.",
      type: "conversation.item.input_audio_transcription.completed",
    });

    expect(harness.events).toEqual([
      {
        key: { connectionEpoch: 1, contentIndex: 0, itemId: "item-user" },
        text: "The supervisor",
        type: "partial",
      },
      {
        key: { connectionEpoch: 1, contentIndex: 0, itemId: "item-user" },
        text: "The supervisor approves it.",
        type: "completed",
      },
    ]);
    expect(harness.localTracks[0]!.enabled).toBe(true);
  });

  test("keeps the duplex session alive when optional input transcription fails", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);

    harness.channels[0]!.receive({
      content_index: 0,
      error: { message: "private provider detail" },
      item_id: "item-user",
      type: "conversation.item.input_audio_transcription.failed",
    });

    expect(harness.events).toEqual([
      {
        key: { connectionEpoch: 1, contentIndex: 0, itemId: "item-user" },
        type: "transcription-failed",
      },
    ]);
    expect(harness.localTracks[0]!.enabled).toBe(true);
    expect(JSON.stringify(harness.events)).not.toContain(
      "private provider detail",
    );
  });

  test("fails closed if Realtime tries to play non-canonical audio", async () => {
    const harness = createHarness();
    await harness.session.connect();

    harness.channels[0]!.receive({
      event_id: "event-unauthorized",
      response_id: "response-unauthorized",
      type: "output_audio_buffer.started",
    });

    const [cancelEvent, clearEvent] = sentEvents(harness.channels[0]!);
    expect(cancelEvent).toMatchObject({
      response_id: "response-unauthorized",
      type: "response.cancel",
    });
    expect(typeof cancelEvent?.event_id).toBe("string");
    expect(clearEvent).toEqual({ type: "output_audio_buffer.clear" });
    expect(harness.events.at(-1)).toMatchObject({
      code: "invalid-response",
      type: "error",
    });
    expect(harness.localTracks[0]!.stop).toHaveBeenCalledOnce();
  });

  test("rejects stale events and cleans the first epoch during reconnect", async () => {
    const harness = createHarness();
    await harness.session.connect();
    const firstChannel = harness.channels[0]!;

    await expect(harness.session.connect()).resolves.toBe(2);
    firstChannel.receive({
      arguments: '{"answer":"Stale"}',
      call_id: "call-stale",
      item_id: "item-stale",
      name: "continue_interview",
      output_index: 0,
      response_id: "response-stale",
      type: "response.function_call_arguments.done",
    });

    expect(harness.events).toEqual([]);
    expect(harness.localTracks[0]!.stop).toHaveBeenCalledOnce();
    expect(harness.peers[0]!.close).toHaveBeenCalledOnce();
  });

  test("sanitizes provider errors and releases media", async () => {
    const harness = createHarness();
    await harness.session.connect();

    harness.channels[0]!.receive({
      error: { message: "private provider body" },
      type: "error",
    });

    expect(harness.events.at(-1)).toMatchObject({
      code: "invalid-response",
      type: "error",
    });
    expect(JSON.stringify(harness.events)).not.toContain(
      "private provider body",
    );
    expect(harness.localTracks[0]!.stop).toHaveBeenCalledOnce();
  });

  test("classifies microphone permission and network failures", async () => {
    const permissionFailure = createHarness();
    permissionFailure.getUserMedia.mockRejectedValueOnce(
      new DOMException("private browser detail", "NotAllowedError"),
    );

    await expect(permissionFailure.session.connect()).rejects.toMatchObject({
      code: "microphone-permission",
      requestId: "voice-request-1",
    });
    expect(
      JSON.stringify(permissionFailure.reportDiagnostic.mock.calls),
    ).not.toContain("private browser detail");

    const networkFailure = createHarness();
    networkFailure.fetch.mockRejectedValueOnce(
      new Error("private network detail"),
    );

    await expect(networkFailure.session.connect()).rejects.toMatchObject({
      code: "network",
      requestId: "voice-request-1",
    });
    expect(networkFailure.localTracks[0]!.stop).toHaveBeenCalledOnce();
    expect(
      JSON.stringify(networkFailure.reportDiagnostic.mock.calls),
    ).not.toContain("private network detail");

    const bodyFailure = createHarness();
    bodyFailure.fetch.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("private response stream detail"));
          },
        }),
        { headers: { "content-type": "application/sdp" } },
      ),
    );

    await expect(bodyFailure.session.connect()).rejects.toMatchObject({
      code: "network",
      requestId: "voice-request-1",
    });
    expect(
      JSON.stringify(bodyFailure.reportDiagnostic.mock.calls),
    ).not.toContain("private response stream detail");
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
      expect(harness.peers[0]!.setRemoteDescription).toHaveBeenCalledOnce(),
    );

    harness.channels[0]!.dispatchEvent(new Event("close"));

    await expect(connection).rejects.toMatchObject({
      code: "network",
      requestId: "voice-request-1",
    });
    expect(harness.localTracks[0]!.stop).toHaveBeenCalledOnce();
    expect(harness.peers[0]!.close).toHaveBeenCalledOnce();
  });

  test("rejects a provider error received before startup completes", async () => {
    const harness = createHarness();
    let resolveFetch: ((response: Response) => void) | undefined;
    harness.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const connection = expect(harness.session.connect()).rejects.toMatchObject({
      code: "invalid-response",
      requestId: "voice-request-1",
    });
    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledOnce());
    harness.peers[0]!.setRemoteDescription.mockImplementationOnce(async () => {
      harness.channels[0]!.open();
      harness.channels[0]!.receive({
        type: "error",
        error: { message: "private provider diagnostic" },
      });
    });
    resolveFetch?.(
      new Response("v=0\r\no=OpenAI answer", {
        headers: { "content-type": "application/sdp" },
      }),
    );

    await connection;
    expect(harness.localTracks[0]!.stop).toHaveBeenCalledOnce();
    expect(JSON.stringify(harness.reportDiagnostic.mock.calls)).not.toContain(
      "private provider diagnostic",
    );
  });

  test("preserves a peer failure while the realtime call is pending", async () => {
    const harness = createHarness();
    harness.fetch.mockImplementationOnce(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const connection = harness.session.connect();
    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledOnce());

    harness.peers[0]!.connectionState = "failed";
    harness.peers[0]!.onconnectionstatechange?.();

    await expect(connection).rejects.toMatchObject({
      code: "network",
      requestId: "voice-request-1",
    });
    expect(harness.reportDiagnostic).toHaveBeenLastCalledWith(
      expect.objectContaining({
        errorCode: "network",
        outcome: "failure",
      }),
    );
  });

  test("preserves a provider failure while waiting for the data channel", async () => {
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
      expect(harness.peers[0]!.setRemoteDescription).toHaveBeenCalledOnce(),
    );
    await Promise.resolve();

    harness.channels[0]!.receive({
      error: { message: "private provider diagnostic" },
      type: "error",
    });

    await expect(connection).rejects.toMatchObject({
      code: "invalid-response",
      requestId: "voice-request-1",
    });
    expect(harness.reportDiagnostic).toHaveBeenLastCalledWith(
      expect.objectContaining({
        errorCode: "invalid-response",
        outcome: "failure",
      }),
    );
  });

  test("rejects a data channel already closed after negotiation", async () => {
    const harness = createHarness({ connectionTimeoutMs: 1_000 });
    let resolveFetch: ((response: Response) => void) | undefined;
    harness.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const connection = expect(harness.session.connect()).rejects.toMatchObject({
      code: "network",
      requestId: "voice-request-1",
    });
    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledOnce());
    harness.peers[0]!.setRemoteDescription.mockImplementationOnce(async () => {
      harness.channels[0]!.close();
    });
    resolveFetch?.(
      new Response("v=0\r\no=OpenAI answer", {
        headers: { "content-type": "application/sdp" },
      }),
    );

    await connection;
  });

  test("sanitizes invalid SDP and browser application failures", async () => {
    const invalidAnswer = createHarness();
    invalidAnswer.fetch.mockResolvedValueOnce(
      new Response("private invalid answer", {
        headers: { "content-type": "application/sdp" },
      }),
    );

    await expect(invalidAnswer.session.connect()).rejects.toMatchObject({
      code: "invalid-response",
      requestId: "voice-request-1",
    });
    expect(
      JSON.stringify(invalidAnswer.reportDiagnostic.mock.calls),
    ).not.toContain("private invalid answer");

    const applicationFailure = createHarness();
    let resolveFetch: ((response: Response) => void) | undefined;
    applicationFailure.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const connection = applicationFailure.session.connect();
    await vi.waitFor(() =>
      expect(applicationFailure.fetch).toHaveBeenCalledOnce(),
    );
    applicationFailure.peers[0]!.setRemoteDescription.mockRejectedValueOnce(
      new Error("private SDP application failure"),
    );
    resolveFetch?.(
      new Response("v=0\r\no=OpenAI answer", {
        headers: { "content-type": "application/sdp" },
      }),
    );

    await expect(connection).rejects.toMatchObject({
      code: "invalid-response",
      requestId: "voice-request-1",
    });
    expect(
      JSON.stringify(applicationFailure.reportDiagnostic.mock.calls),
    ).not.toContain("private SDP application failure");
  });

  test("classifies explicit disconnect during startup as aborted", async () => {
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
    expect(harness.localTracks[0]!.stop).toHaveBeenCalledOnce();
    expect(JSON.stringify(harness.reportDiagnostic.mock.calls)).not.toContain(
      "private abort detail",
    );
  });

  test("closes all media when the peer connection fails", async () => {
    const harness = createHarness();
    await harness.session.connect();
    harness.session.setMicrophoneEnabled(true);

    harness.peers[0]!.connectionState = "failed";
    harness.peers[0]!.onconnectionstatechange?.();

    expect(harness.events.at(-1)).toMatchObject({
      code: "network",
      type: "error",
    });
    expect(harness.localTracks[0]!.enabled).toBe(false);
    expect(harness.localTracks[0]!.stop).toHaveBeenCalledOnce();
    expect(harness.channels[0]!.close).toHaveBeenCalledOnce();
    expect(harness.peers[0]!.close).toHaveBeenCalledOnce();
  });

  test("times out a stalled microphone permission prompt and stops late media", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const lateTrack = { enabled: true, kind: "audio", stop: vi.fn() };
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

    const connection = harness.session
      .connect()
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15_000);
    resolveMedia?.(lateStream);

    await expect(connection).resolves.toMatchObject({
      code: "timeout",
      requestId: "voice-request-1",
    });
    expect(lateTrack.stop).toHaveBeenCalledOnce();
  });
});
