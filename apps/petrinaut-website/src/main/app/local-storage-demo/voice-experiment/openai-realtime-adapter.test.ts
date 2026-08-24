import { describe, expect, test, vi } from "vitest";

import { createOpenAIRealtimeAdapter } from "./openai-realtime-adapter";

import type { VoiceExperimentEvent } from "./voice-experiment-events";

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

const createHarness = () => {
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
  let now = 1_000;

  const adapter = createOpenAIRealtimeAdapter({
    createAudioElement: () => audioElement as unknown as HTMLAudioElement,
    createPeerConnection: () => peerConnection as unknown as RTCPeerConnection,
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
        headers: { "x-voice-experiment": "openai-realtime" },
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

  test("implements the documented WebRTC push-to-talk sequence", async () => {
    const harness = createHarness();
    await harness.adapter.connect();

    await harness.adapter.startTurn();

    expect(harness.microphoneTrack.enabled).toBe(true);
    expect(harness.dataChannel.sent).toEqual([
      { type: "input_audio_buffer.clear" },
    ]);
    expect(harness.events.at(-1)).toEqual({
      timestampMs: 1_002,
      turnId: 1,
      type: "recording-started",
    });

    await harness.adapter.finishTurn();

    expect(harness.microphoneTrack.enabled).toBe(false);
    expect(harness.dataChannel.sent).toEqual([
      { type: "input_audio_buffer.clear" },
      { type: "input_audio_buffer.commit" },
      { type: "response.create" },
    ]);
  });

  test("normalizes expert and assistant transcript events", async () => {
    const harness = createHarness();
    await harness.adapter.connect();
    await harness.adapter.startTurn();
    await harness.adapter.finishTurn();

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
      timestampMs: 1_003,
      transcript: "The support lead",
      turnId: 1,
      type: "partial-transcript",
    });
    expect(harness.events).toContainEqual({
      speaker: "expert",
      timestampMs: 1_004,
      transcript: "The support lead owns the escalation.",
      turnId: 1,
      type: "final-transcript",
    });
    expect(harness.events).toContainEqual({
      speaker: "assistant",
      timestampMs: 1_006,
      transcript: "What happens next?",
      turnId: 1,
      type: "partial-transcript",
    });
    expect(harness.events).toContainEqual({
      responseText: "What happens next?",
      timestampMs: 1_008,
      turnId: 1,
      type: "response-completed",
    });
  });

  test("executes only dummy tools and continues the same turn", async () => {
    const harness = createHarness();
    await harness.adapter.connect();
    await harness.adapter.startTurn();
    await harness.adapter.finishTurn();
    harness.dataChannel.receive({ type: "response.created" });

    harness.dataChannel.receive({
      type: "response.done",
      response: {
        output: [
          {
            arguments: '{"name":"Triage","description":"Assess severity"}',
            call_id: "call-1",
            name: "record_process_step",
            type: "function_call",
          },
        ],
        status: "completed",
      },
    });

    expect(harness.events).toContainEqual({
      timestampMs: 1_004,
      toolName: "record_process_step",
      turnId: 1,
      type: "tool-called",
    });
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

  test("cancels response audio when the expert barges in", async () => {
    const harness = createHarness();
    await harness.adapter.connect();
    await harness.adapter.startTurn();
    await harness.adapter.finishTurn();
    harness.dataChannel.receive({ type: "response.created" });

    await harness.adapter.startTurn();

    expect(harness.dataChannel.sent.slice(-3)).toEqual([
      { type: "input_audio_buffer.clear" },
      { type: "response.cancel" },
      { type: "output_audio_buffer.clear" },
    ]);
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
