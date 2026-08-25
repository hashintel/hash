import { describe, expect, test, vi } from "vitest";

import { createOpenAIRealtimeAdapter } from "./openai-realtime-adapter";

import type { VoiceExperimentEvent } from "./voice-experiment-events";

const encoder = new TextEncoder();

const sseResponse = (...chunks: Record<string, unknown>[]) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
          );
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    }),
  );

class FakeDataChannel extends EventTarget {
  public readyState: RTCDataChannelState = "connecting";
  public readonly sent: unknown[] = [];

  public close = vi.fn(() => {
    this.readyState = "closed";
  });

  public open() {
    this.readyState = "open";
    this.dispatchEvent(new Event("open"));
  }

  public receive(payload: unknown) {
    const event = new Event("message");
    Object.defineProperty(event, "data", { value: JSON.stringify(payload) });
    this.dispatchEvent(event);
  }

  public send(payload: string) {
    this.sent.push(JSON.parse(payload));
  }
}

const createHarness = ({
  brunchResponse,
  elicitor = "mock",
}: {
  brunchResponse?: Response;
  elicitor?: "brunch" | "mock";
} = {}) => {
  const dataChannel = new FakeDataChannel();
  const microphoneTrack = {
    enabled: true,
    stop: vi.fn(),
  };
  const mediaStream = {
    getAudioTracks: () => [microphoneTrack],
    getTracks: () => [microphoneTrack],
  };
  const audioElement = {
    autoplay: false,
    pause: vi.fn(),
    srcObject: null,
  };
  const peerConnection = {
    addTrack: vi.fn(),
    close: vi.fn(),
    createDataChannel: vi.fn(() => dataChannel),
    createOffer: vi.fn(async () => ({ sdp: "offer-sdp", type: "offer" })),
    onconnectionstatechange: null,
    ontrack: null,
    setLocalDescription: vi.fn(async () => undefined),
    setRemoteDescription: vi.fn(async () => {
      dataChannel.open();
    }),
  };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        clientSecret: "ephemeral-client-secret",
        expiresAt: 1_800_000_000,
      }),
    )
    .mockResolvedValueOnce(new Response("answer-sdp"));
  if (brunchResponse) {
    fetch.mockResolvedValueOnce(brunchResponse);
  }
  let now = 1_000;

  const adapter = createOpenAIRealtimeAdapter({
    conversationId: "voice-conversation",
    createAudioElement: () => audioElement as unknown as HTMLAudioElement,
    createPeerConnection: () => peerConnection as unknown as RTCPeerConnection,
    elicitor,
    fetch: fetch as typeof globalThis.fetch,
    getUserMedia: vi.fn(async () => mediaStream as unknown as MediaStream),
    now: () => ++now,
  });
  const events: VoiceExperimentEvent[] = [];
  adapter.subscribe((event) => events.push(event));

  return {
    adapter,
    audioElement,
    dataChannel,
    events,
    fetch,
    mediaStream,
    microphoneTrack,
    peerConnection,
  };
};

describe("OpenAIRealtimeAdapter", () => {
  test("connects with a server-minted secret and keeps the microphone gated", async () => {
    const harness = createHarness();

    await harness.adapter.connect();

    expect(harness.fetch).toHaveBeenNthCalledWith(
      1,
      "/api/voice-experiment/openai-realtime-session",
      expect.objectContaining({
        headers: {
          "x-voice-elicitor": "mock",
          "x-voice-experiment": "openai-realtime",
        },
        method: "POST",
      }),
    );
    expect(harness.fetch).toHaveBeenNthCalledWith(
      2,
      "https://api.openai.com/v1/realtime/calls",
      expect.objectContaining({
        body: "offer-sdp",
        headers: {
          authorization: "Bearer ephemeral-client-secret",
          "content-type": "application/sdp",
        },
        method: "POST",
      }),
    );
    expect(harness.fetch.mock.calls.flat().join(" ")).not.toContain(
      "/api/chat",
    );
    expect(harness.microphoneTrack.enabled).toBe(false);
    expect(harness.events).toEqual([{ timestampMs: 1_001, type: "connected" }]);
  });

  test("opens with one interviewer question and leaves semantic VAD in control", async () => {
    const harness = createHarness();
    await harness.adapter.connect();

    await harness.adapter.startTurn();

    expect(harness.microphoneTrack.enabled).toBe(false);
    expect(harness.dataChannel.sent).toEqual([
      { type: "input_audio_buffer.clear" },
      {
        type: "response.create",
        response: {
          instructions:
            'Say exactly: "Hi—what process would you like us to model today?" Do not call a tool.',
        },
      },
    ]);
    expect(harness.events).toEqual([{ timestampMs: 1_001, type: "connected" }]);

    await harness.adapter.finishTurn();
    await harness.adapter.startTurn();

    expect(harness.microphoneTrack.enabled).toBe(false);
    expect(harness.dataChannel.sent).toEqual([
      { type: "input_audio_buffer.clear" },
      {
        type: "response.create",
        response: {
          instructions:
            'Say exactly: "Hi—what process would you like us to model today?" Do not call a tool.',
        },
      },
    ]);
  });

  test("normalizes expert and assistant transcript events", async () => {
    const harness = createHarness();
    await harness.adapter.connect();
    await harness.adapter.startTurn();

    harness.dataChannel.receive({
      type: "input_audio_buffer.committed",
      item_id: "expert-item",
    });
    harness.dataChannel.receive({
      type: "conversation.item.input_audio_transcription.delta",
      item_id: "expert-item",
      delta: "The support lead",
    });
    harness.dataChannel.receive({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "expert-item",
      transcript: "The support lead owns the escalation.",
    });
    harness.dataChannel.receive({ type: "response.created" });
    harness.dataChannel.receive({
      type: "response.output_audio_transcript.delta",
      item_id: "assistant-item",
      delta: "What happens next?",
    });
    harness.dataChannel.receive({
      type: "response.output_audio_transcript.done",
      item_id: "assistant-item",
      transcript: "What happens next?",
    });
    harness.dataChannel.receive({
      type: "response.done",
      response: { output: [], status: "completed" },
    });

    expect(harness.events).toContainEqual({
      speaker: "expert",
      timestampMs: 1_002,
      transcript: "The support lead",
      turnId: 1,
      type: "partial-transcript",
    });
    expect(harness.events).toContainEqual({
      speaker: "expert",
      timestampMs: 1_003,
      transcript: "The support lead owns the escalation.",
      turnId: 1,
      type: "final-transcript",
    });
    expect(harness.events).toContainEqual({
      speaker: "assistant",
      timestampMs: 1_005,
      transcript: "What happens next?",
      turnId: 1,
      type: "partial-transcript",
    });
    expect(harness.events).toContainEqual({
      responseText: "What happens next?",
      timestampMs: 1_007,
      turnId: 1,
      type: "response-completed",
    });
  });

  test("does not render an empty finalized expert transcript", async () => {
    const harness = createHarness();
    await harness.adapter.connect();
    await harness.adapter.startTurn();

    harness.dataChannel.receive({
      type: "input_audio_buffer.committed",
      item_id: "empty-expert-item",
    });
    harness.dataChannel.receive({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "empty-expert-item",
      transcript: "   ",
    });

    expect(
      harness.events.some(
        (event) =>
          event.type === "final-transcript" && event.speaker === "expert",
      ),
    ).toBe(false);
    expect(harness.dataChannel.sent).not.toContainEqual({
      type: "response.create",
    });
  });

  test("uses Brunch as the authoritative elicitor and Realtime only for speech", async () => {
    const harness = createHarness({
      elicitor: "brunch",
      brunchResponse: sseResponse(
        { type: "start", messageId: "assistant-ask" },
        { type: "text-delta", id: "text-1", delta: "Thanks. " },
        {
          type: "tool-input-available",
          toolCallId: "ask-1",
          toolName: "brunch_ask",
          input: { question: "What happens next?" },
        },
        { type: "finish", finishReason: "tool-calls" },
      ),
    });
    await harness.adapter.connect();
    await harness.adapter.startTurn();

    harness.dataChannel.receive({
      type: "input_audio_buffer.committed",
      item_id: "expert-item",
    });
    harness.dataChannel.receive({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "expert-item",
      transcript: "The support lead triages it.",
    });

    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalledTimes(3));
    const [chatUrl, chatRequest] = harness.fetch.mock.calls[2] as [
      string,
      RequestInit,
    ];
    expect(chatUrl).toBe("/api/voice-experiment/brunch-chat");
    expect(JSON.parse(chatRequest.body as string)).toMatchObject({
      id: "voice:voice-conversation",
      messages: [
        {
          role: "user",
          parts: [{ type: "text", text: "The support lead triages it." }],
        },
      ],
    });
    type SentResponseCreate = {
      response?: {
        conversation?: string;
        input?: unknown[];
        metadata?: Record<string, string>;
        output_modalities?: string[];
      };
      type?: string;
    };
    let brunchSpeechRequest: SentResponseCreate | undefined;
    await vi.waitFor(() => {
      brunchSpeechRequest = (
        harness.dataChannel.sent as SentResponseCreate[]
      ).find(
        (event) =>
          event.type === "response.create" &&
          event.response?.metadata?.source === "brunch",
      );
      expect(brunchSpeechRequest).toBeDefined();
    });
    expect(brunchSpeechRequest).toMatchObject({
      type: "response.create",
      response: {
        conversation: "none",
        input: [],
        metadata: { source: "brunch", turnId: "1" },
        output_modalities: ["audio"],
      },
    });

    expect(harness.events).toContainEqual(
      expect.objectContaining({
        speaker: "assistant",
        transcript: "Thanks. What happens next?",
        turnId: 1,
        type: "final-transcript",
      }),
    );
    expect(harness.events).toContainEqual(
      expect.objectContaining({
        argumentSummary: "Question: What happens next?",
        callId: "ask-1",
        toolName: "brunch_ask",
        type: "tool-called",
      }),
    );
    expect(harness.microphoneTrack.enabled).toBe(false);

    harness.dataChannel.receive({
      type: "response.created",
      response: { id: "brunch-speech-response" },
    });
    harness.dataChannel.receive({
      type: "response.output_audio_transcript.done",
      response_id: "brunch-speech-response",
      item_id: "generated-speech-item",
      transcript: "A paraphrase that is not authoritative.",
    });
    harness.dataChannel.receive({
      type: "response.done",
      response: {
        id: "brunch-speech-response",
        output: [
          {
            type: "message",
            content: [{ type: "audio", transcript: "Generated speech" }],
          },
        ],
        status: "completed",
      },
    });

    expect(JSON.stringify(harness.events)).not.toContain(
      "A paraphrase that is not authoritative.",
    );
    expect(harness.events).toContainEqual(
      expect.objectContaining({
        responseText: "Thanks. What happens next?",
        turnId: 1,
        type: "response-completed",
      }),
    );
    expect(harness.microphoneTrack.enabled).toBe(false);

    harness.dataChannel.receive({
      type: "output_audio_buffer.stopped",
      response_id: "brunch-speech-response",
    });
    expect(harness.microphoneTrack.enabled).toBe(true);
  });

  test("listens only between interviewer responses", async () => {
    const harness = createHarness();
    await harness.adapter.connect();
    await harness.adapter.startTurn();

    expect(harness.microphoneTrack.enabled).toBe(false);
    harness.dataChannel.receive({
      type: "response.created",
      response: { id: "opening-response" },
    });
    expect(harness.microphoneTrack.enabled).toBe(false);

    harness.dataChannel.receive({
      type: "response.done",
      response: {
        id: "opening-response",
        output: [
          {
            type: "message",
            content: [{ type: "audio", transcript: "Opening question" }],
          },
        ],
        status: "completed",
      },
    });
    expect(harness.microphoneTrack.enabled).toBe(false);
    harness.dataChannel.receive({
      type: "output_audio_buffer.stopped",
      response_id: "opening-response",
    });
    expect(harness.microphoneTrack.enabled).toBe(true);

    harness.dataChannel.receive({
      type: "input_audio_buffer.committed",
      item_id: "expert-answer",
    });
    expect(harness.microphoneTrack.enabled).toBe(false);
    harness.dataChannel.receive({
      type: "response.created",
      response: { id: "answer-response" },
    });
    harness.dataChannel.receive({
      type: "response.done",
      response: {
        id: "answer-response",
        output: [
          {
            type: "message",
            content: [{ type: "audio", transcript: "Next question" }],
          },
        ],
        status: "completed",
      },
    });
    expect(harness.microphoneTrack.enabled).toBe(false);
    harness.dataChannel.receive({
      type: "output_audio_buffer.stopped",
      response_id: "answer-response",
    });
    expect(harness.microphoneTrack.enabled).toBe(true);
  });

  test("reopens the microphone as server VAD creates distinct expert turns", async () => {
    const harness = createHarness();
    await harness.adapter.connect();
    await harness.adapter.startTurn();

    harness.dataChannel.receive({
      type: "input_audio_buffer.committed",
      item_id: "expert-item-1",
    });
    harness.dataChannel.receive({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "expert-item-1",
      transcript: "The support lead triages it.",
    });
    harness.dataChannel.receive({ type: "response.created" });
    harness.dataChannel.receive({
      type: "response.done",
      response: { output: [], status: "completed" },
    });
    harness.dataChannel.receive({
      type: "input_audio_buffer.committed",
      item_id: "expert-item-2",
    });
    harness.dataChannel.receive({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "expert-item-2",
      transcript: "Then the incident owner takes over.",
    });

    expect(harness.microphoneTrack.enabled).toBe(false);
    expect(harness.dataChannel.sent).toEqual([
      { type: "input_audio_buffer.clear" },
      {
        type: "response.create",
        response: {
          instructions:
            'Say exactly: "Hi—what process would you like us to model today?" Do not call a tool.',
        },
      },
      { type: "response.create" },
      { type: "input_audio_buffer.clear" },
      { type: "response.create" },
    ]);
    expect(harness.events).toContainEqual({
      speaker: "expert",
      timestampMs: 1_002,
      transcript: "The support lead triages it.",
      turnId: 1,
      type: "final-transcript",
    });
    expect(harness.events).toContainEqual({
      speaker: "expert",
      timestampMs: 1_006,
      transcript: "Then the incident owner takes over.",
      turnId: 2,
      type: "final-transcript",
    });
  });

  test("completes a cancelled response on its original turn", async () => {
    const harness = createHarness();
    await harness.adapter.connect();
    await harness.adapter.startTurn();

    harness.dataChannel.receive({
      type: "response.created",
      response: { id: "response-1" },
    });
    harness.dataChannel.receive({
      type: "input_audio_buffer.committed",
      item_id: "expert-item-1",
    });
    harness.dataChannel.receive({
      type: "input_audio_buffer.committed",
      item_id: "expert-item-2",
    });
    harness.dataChannel.receive({
      type: "response.done",
      response: { id: "response-1", status: "cancelled" },
    });

    expect(harness.events).toContainEqual({
      timestampMs: 1_003,
      turnId: 1,
      type: "response-completed",
    });
    expect(harness.events.at(-1)).toEqual({
      timestampMs: 1_004,
      turnId: 3,
      type: "recording-started",
    });
  });

  test("keeps late assistant transcript events on their response turn", async () => {
    const harness = createHarness();
    await harness.adapter.connect();
    await harness.adapter.startTurn();

    harness.dataChannel.receive({
      type: "response.created",
      response: { id: "response-1" },
    });
    harness.dataChannel.receive({
      type: "response.output_item.added",
      response_id: "response-1",
      item: { id: "assistant-item-1" },
    });
    harness.dataChannel.receive({
      type: "input_audio_buffer.committed",
      item_id: "expert-item-1",
    });
    harness.dataChannel.receive({
      type: "input_audio_buffer.committed",
      item_id: "expert-item-2",
    });
    harness.dataChannel.receive({
      type: "response.output_audio_transcript.delta",
      response_id: "response-1",
      item_id: "assistant-item-1",
      delta: "Interrupted question",
    });

    expect(harness.events.at(-1)).toEqual({
      speaker: "assistant",
      timestampMs: 1_003,
      transcript: "Interrupted question",
      turnId: 1,
      type: "partial-transcript",
    });
  });

  test("executes only dummy tools and continues the same turn", async () => {
    const harness = createHarness();
    await harness.adapter.connect();
    await harness.adapter.startTurn();
    harness.dataChannel.receive({ type: "response.created" });

    harness.dataChannel.receive({
      type: "response.done",
      response: {
        output: [
          {
            arguments:
              '{"name":"Triage","description":"Assess severity","owner":"Support lead","secret":"must-not-leak"}',
            call_id: "call-1",
            name: "record_process_step",
            type: "function_call",
          },
        ],
        status: "completed",
      },
    });

    expect(harness.events).toContainEqual({
      argumentSummary: "Triage · Assess severity · Owner: Support lead",
      callId: "call-1",
      timestampMs: 1_003,
      toolName: "record_process_step",
      turnId: 1,
      type: "tool-called",
    });
    expect(JSON.stringify(harness.events)).not.toContain("must-not-leak");
    expect(harness.dataChannel.sent).toContainEqual({
      type: "conversation.item.create",
      item: {
        call_id: "call-1",
        output: JSON.stringify({
          mode: "experiment-only",
          recorded: true,
        }),
        type: "function_call_output",
      },
    });
    expect(harness.dataChannel.sent.at(-1)).toEqual({
      type: "response.create",
    });
    expect(
      harness.events.some((event) => event.type === "response-completed"),
    ).toBe(false);
  });

  test("ends a background-audio turn silently after wait_for_user", async () => {
    const harness = createHarness();
    await harness.adapter.connect();
    await harness.adapter.startTurn();
    harness.dataChannel.receive({ type: "response.created" });

    harness.dataChannel.receive({
      type: "response.done",
      response: {
        output: [
          {
            arguments: "{}",
            call_id: "call-wait",
            name: "wait_for_user",
            type: "function_call",
          },
        ],
        status: "completed",
      },
    });

    expect(harness.events).toContainEqual({
      argumentSummary: "Silent no-op",
      callId: "call-wait",
      timestampMs: 1_003,
      toolName: "wait_for_user",
      turnId: 1,
      type: "tool-called",
    });
    expect(harness.dataChannel.sent).toContainEqual({
      type: "conversation.item.create",
      item: {
        call_id: "call-wait",
        output: JSON.stringify({ mode: "experiment-only", waited: true }),
        type: "function_call_output",
      },
    });
    expect(harness.dataChannel.sent).not.toContainEqual({
      type: "response.create",
    });
    expect(harness.events).toContainEqual({
      timestampMs: 1_004,
      turnId: 1,
      type: "response-completed",
    });
    expect(harness.events.at(-1)).toEqual({
      timestampMs: 1_005,
      turnId: 1,
      type: "recording-started",
    });
  });

  test("does not manually commit or recreate turns while the mic is open", async () => {
    const harness = createHarness();
    await harness.adapter.connect();
    await harness.adapter.startTurn();
    await harness.adapter.finishTurn();
    harness.dataChannel.receive({ type: "response.created" });

    await harness.adapter.startTurn();

    expect(harness.dataChannel.sent).toEqual([
      { type: "input_audio_buffer.clear" },
      {
        type: "response.create",
        response: {
          instructions:
            'Say exactly: "Hi—what process would you like us to model today?" Do not call a tool.',
        },
      },
    ]);
    expect(harness.microphoneTrack.enabled).toBe(false);
  });

  test("releases media, playback, and connection resources idempotently", async () => {
    const harness = createHarness();
    await harness.adapter.connect();

    await harness.adapter.dispose();
    await harness.adapter.dispose();

    expect(harness.microphoneTrack.stop).toHaveBeenCalledTimes(1);
    expect(harness.audioElement.pause).toHaveBeenCalledTimes(1);
    expect(harness.audioElement.srcObject).toBeNull();
    expect(harness.dataChannel.close).toHaveBeenCalledTimes(1);
    expect(harness.peerConnection.close).toHaveBeenCalledTimes(1);
  });
});
