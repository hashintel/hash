import { describe, expect, test, vi } from "vitest";

import { createElevenLabsAdapter } from "./elevenlabs-adapter";

import type { VoiceExperimentEvent } from "./voice-experiment-events";

type SessionCallbacks = {
  onConnect?: (event: { conversationId: string }) => void;
  onDisconnect?: (details: { reason: string }) => void;
  onError?: (message: string) => void;
  onInterruption?: () => void;
  onMessage?: (event: {
    event_id?: number;
    message: string;
    role: "agent" | "user";
  }) => void;
  onModeChange?: (event: { mode: "listening" | "speaking" }) => void;
  onConversationCreated?: (conversation: FakeConversation) => void;
};

class FakeConversation {
  public endSession = vi.fn(async () => undefined);
  public setMicMuted = vi.fn();
}

const createHarness = () => {
  const conversation = new FakeConversation();
  let callbacks: SessionCallbacks | null = null;
  const startSession = vi.fn(async (options: SessionCallbacks) => {
    callbacks = options;
    options.onConversationCreated?.(conversation);
    options.onConnect?.({ conversationId: "conv_123" });
    return conversation;
  });
  const permissionTrack = { stop: vi.fn() };
  const getUserMedia = vi.fn(async () => ({
    getTracks: () => [permissionTrack],
  }));
  const fetch = vi.fn().mockResolvedValue(
    Response.json({
      conversationId: "conv_123",
      conversationToken: "short-lived-token",
    }),
  );
  let now = 1_000;
  const adapter = createElevenLabsAdapter({
    fetch: fetch as typeof globalThis.fetch,
    getUserMedia: getUserMedia as unknown as (
      constraints: MediaStreamConstraints,
    ) => Promise<MediaStream>,
    now: () => ++now,
    startSession,
  });
  const events: VoiceExperimentEvent[] = [];
  adapter.subscribe((event) => events.push(event));

  return {
    adapter,
    callbacks: () => callbacks,
    conversation,
    events,
    fetch,
    getUserMedia,
    permissionTrack,
    startSession,
  };
};

describe("ElevenLabsAdapter", () => {
  test("starts an authenticated WebRTC session with the microphone gated", async () => {
    const harness = createHarness();

    await harness.adapter.connect();

    expect(harness.fetch).toHaveBeenCalledWith(
      "/api/voice-experiment/elevenlabs-conversation-token",
      expect.objectContaining({
        headers: { "x-voice-experiment": "elevenlabs-brunch" },
        method: "POST",
      }),
    );
    expect(harness.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(harness.permissionTrack.stop).toHaveBeenCalledTimes(1);
    expect(harness.startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionType: "webrtc",
        conversationToken: "short-lived-token",
      }),
    );
    expect(harness.conversation.setMicMuted).toHaveBeenCalledWith(true);
    expect(harness.fetch.mock.calls.flat().join(" ")).not.toContain(
      "/api/chat",
    );
    expect(harness.events).toContainEqual({
      timestampMs: 1_001,
      type: "connected",
    });
  });

  test("uses microphone mute as the hold-to-speak boundary", async () => {
    const harness = createHarness();
    await harness.adapter.connect();

    await harness.adapter.startTurn();
    await harness.adapter.finishTurn();

    expect(harness.conversation.setMicMuted.mock.calls).toEqual([
      [true],
      [false],
      [true],
    ]);
    expect(harness.events.at(-1)).toEqual({
      timestampMs: 1_002,
      turnId: 1,
      type: "recording-started",
    });
  });

  test("normalizes expert and Brunch response events", async () => {
    const harness = createHarness();
    await harness.adapter.connect();
    await harness.adapter.startTurn();
    await harness.adapter.finishTurn();

    harness.callbacks()?.onMessage?.({
      event_id: 10,
      message: "The support lead triages the escalation.",
      role: "user",
    });
    harness.callbacks()?.onModeChange?.({ mode: "speaking" });
    harness.callbacks()?.onMessage?.({
      event_id: 11,
      message: "Who owns the next handoff?",
      role: "agent",
    });

    expect(harness.events).toContainEqual({
      speaker: "expert",
      timestampMs: 1_003,
      transcript: "The support lead triages the escalation.",
      turnId: 1,
      type: "final-transcript",
    });
    expect(harness.events).toContainEqual({
      timestampMs: 1_004,
      turnId: 1,
      type: "response-started",
    });
    expect(harness.events).toContainEqual({
      speaker: "assistant",
      timestampMs: 1_005,
      transcript: "Who owns the next handoff?",
      turnId: 1,
      type: "final-transcript",
    });
    expect(harness.events).toContainEqual({
      responseText: "Who owns the next handoff?",
      timestampMs: 1_006,
      turnId: 1,
      type: "response-completed",
    });
  });

  test("releases ElevenLabs microphone, playback, and connection once", async () => {
    const harness = createHarness();
    await harness.adapter.connect();

    await harness.adapter.dispose();
    await harness.adapter.dispose();

    expect(harness.conversation.endSession).toHaveBeenCalledTimes(1);
  });
});
