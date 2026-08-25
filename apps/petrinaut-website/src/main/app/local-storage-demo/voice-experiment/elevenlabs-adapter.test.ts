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

const createHarness = ({ autoConnect = true } = {}) => {
  const conversation = new FakeConversation();
  let callbacks: SessionCallbacks | null = null;
  let diagnosticPoll: (() => void) | null = null;
  let diagnosticResponse: unknown = { events: [] };
  const startSession = vi.fn(async (options: SessionCallbacks) => {
    callbacks = options;
    options.onConversationCreated?.(conversation);
    if (autoConnect) {
      options.onConnect?.({ conversationId: "conv_123" });
    }
    return conversation;
  });
  const permissionTrack = { stop: vi.fn() };
  const getUserMedia = vi.fn(async () => ({
    getTracks: () => [permissionTrack],
  }));
  const fetch = vi.fn(async (input: RequestInfo | URL) =>
    (input instanceof Request
      ? input.url
      : input instanceof URL
        ? input.href
        : input
    ).includes("elevenlabs-brunch-diagnostics")
      ? Response.json(diagnosticResponse)
      : Response.json({
          conversationId: "conv_123",
          conversationToken: "short-lived-token",
        }),
  );
  const clearInterval = vi.fn();
  const setInterval = vi.fn((callback: () => void) => {
    diagnosticPoll = callback;
    return 17 as unknown as ReturnType<typeof globalThis.setInterval>;
  });
  let now = 1_000;
  const adapter = createElevenLabsAdapter({
    clearInterval,
    fetch: fetch as typeof globalThis.fetch,
    getUserMedia: getUserMedia as unknown as (
      constraints: MediaStreamConstraints,
    ) => Promise<MediaStream>,
    now: () => ++now,
    setInterval,
    startSession,
  });
  const events: VoiceExperimentEvent[] = [];
  adapter.subscribe((event) => events.push(event));

  return {
    adapter,
    callbacks: () => callbacks,
    clearInterval,
    conversation,
    events,
    fetch,
    getUserMedia,
    permissionTrack,
    pollDiagnostics: async (response: unknown) => {
      diagnosticResponse = response;
      diagnosticPoll?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    setInterval,
    startSession,
  };
};

describe("ElevenLabsAdapter", () => {
  test("can connect after an unused adapter is disposed by a Strict Mode cleanup", async () => {
    const harness = createHarness();

    await harness.adapter.dispose();
    await harness.adapter.connect();

    await expect(harness.adapter.startTurn()).resolves.toBeUndefined();
    expect(harness.conversation.endSession).not.toHaveBeenCalled();
    expect(harness.conversation.setMicMuted.mock.calls).toEqual([
      [true],
      [false],
    ]);
  });

  test("does not resolve connect until ElevenLabs reports the session connected", async () => {
    const harness = createHarness({ autoConnect: false });
    let connectionResolved = false;

    const connection = harness.adapter.connect().then(() => {
      connectionResolved = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(harness.startSession).toHaveBeenCalledTimes(1);
    expect(connectionResolved).toBe(false);

    harness.callbacks()?.onConnect?.({ conversationId: "conv_123" });
    await connection;

    expect(connectionResolved).toBe(true);
    await expect(harness.adapter.startTurn()).resolves.toBeUndefined();
  });

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
        overrides: {
          agent: {
            firstMessage: "Hi—what process would you like us to model today?",
          },
        },
      }),
    );
    expect(harness.conversation.setMicMuted).toHaveBeenCalledWith(true);
    expect(
      harness.fetch.mock.calls
        .map(([input]) =>
          input instanceof Request
            ? input.url
            : input instanceof URL
              ? input.href
              : input,
        )
        .join(" "),
    ).not.toContain("/api/chat");
    expect(harness.events).toContainEqual({
      conversationId: "conv_123",
      timestampMs: 1_001,
      type: "connected",
    });
  });

  test("leaves the microphone open after the conversation starts", async () => {
    const harness = createHarness();
    await harness.adapter.connect();

    await harness.adapter.startTurn();
    await harness.adapter.finishTurn();
    await harness.adapter.startTurn();

    expect(harness.conversation.setMicMuted.mock.calls).toEqual([
      [true],
      [false],
    ]);
    expect(harness.events.at(-1)).toEqual({
      timestampMs: 1_002,
      turnId: 1,
      type: "recording-started",
    });
  });

  test("does not open the mic over an opening question already playing", async () => {
    const harness = createHarness();
    await harness.adapter.connect();

    harness.callbacks()?.onModeChange?.({ mode: "speaking" });
    await harness.adapter.startTurn();

    expect(harness.conversation.setMicMuted.mock.calls).toEqual([[true]]);

    harness.callbacks()?.onModeChange?.({ mode: "listening" });
    expect(harness.conversation.setMicMuted.mock.calls).toEqual([
      [true],
      [false],
    ]);
  });

  test("shows only the client opening question before Brunch diagnostics", async () => {
    const harness = createHarness();
    await harness.adapter.connect();
    await harness.adapter.startTurn();

    harness.callbacks()?.onModeChange?.({ mode: "speaking" });
    harness.callbacks()?.onMessage?.({
      event_id: 10,
      message: "Hi—what process would you like us to model today?",
      role: "agent",
    });
    harness.callbacks()?.onModeChange?.({ mode: "listening" });
    harness.callbacks()?.onMessage?.({
      event_id: 11,
      message: "Test elicitation.",
      role: "user",
    });
    harness.callbacks()?.onMessage?.({
      event_id: 12,
      message: "This Brunch response arrives through diagnostics.",
      role: "agent",
    });

    expect(harness.events).toEqual([
      {
        conversationId: "conv_123",
        timestampMs: 1_001,
        type: "connected",
      },
      { timestampMs: 1_002, turnId: 1, type: "recording-started" },
      { timestampMs: 1_003, turnId: 1, type: "response-started" },
      {
        speaker: "assistant",
        timestampMs: 1_004,
        transcript: "Hi—what process would you like us to model today?",
        turnId: 1,
        type: "final-transcript",
      },
      {
        responseText: "Hi—what process would you like us to model today?",
        timestampMs: 1_005,
        turnId: 1,
        type: "response-completed",
      },
    ]);
    expect(harness.conversation.setMicMuted.mock.calls).toEqual([
      [true],
      [false],
      [true],
      [false],
      [true],
    ]);
  });

  test("polls normalized Brunch tool diagnostics for the provider conversation", async () => {
    const harness = createHarness();
    await harness.adapter.connect();

    await harness.pollDiagnostics({
      events: [
        {
          argumentSummary: "Question: Who owns triage?",
          callId: "call_ask",
          privateInput: "must-not-appear",
          sequence: 1,
          timestampMs: 2_000,
          toolName: "brunch_ask",
          turnId: 1,
        },
        {
          argumentSummary: "Arguments hidden",
          callId: "call_step",
          capture: {
            captureId: "capture-call_step",
            input: {
              description: "Assess severity",
              name: "Triage",
              owner: "Support lead",
              secret: "must-not-appear",
            },
            toolName: "record_process_step",
          },
          sequence: 2,
          timestampMs: 2_001,
          toolName: "record_process_step",
          turnId: 1,
        },
        {
          callId: "sweep-1",
          sequence: 3,
          timestampMs: 2_002,
          type: "projection-ready",
        },
      ],
    });

    expect(harness.fetch).toHaveBeenCalledWith(
      "/api/voice-experiment/elevenlabs-brunch-diagnostics?conversationId=conv_123&after=0",
      { headers: { "x-voice-experiment": "elevenlabs-brunch" } },
    );
    expect(harness.events).toContainEqual({
      argumentSummary: "Question: Who owns triage?",
      callId: "call_ask",
      timestampMs: 2_000,
      toolName: "brunch_ask",
      turnId: 1,
      type: "tool-called",
    });
    expect(harness.events).toContainEqual({
      callId: "sweep-1",
      timestampMs: 2_002,
      type: "projection-ready",
    });
    expect(harness.events).toContainEqual({
      argumentSummary: "Arguments hidden",
      callId: "call_step",
      capture: {
        captureId: "capture-call_step",
        input: {
          description: "Assess severity",
          name: "Triage",
          owner: "Support lead",
        },
        toolName: "record_process_step",
      },
      timestampMs: 2_001,
      toolName: "record_process_step",
      turnId: 1,
      type: "tool-called",
    });
    expect(JSON.stringify(harness.events)).not.toContain("must-not-appear");

    await harness.adapter.dispose();
    expect(harness.clearInterval).toHaveBeenCalledWith(17);
  });

  test("surfaces Speech Engine transcripts from diagnostics", async () => {
    const harness = createHarness();
    await harness.adapter.connect();

    await harness.pollDiagnostics({
      events: [
        {
          sequence: 1,
          speaker: "expert",
          timestampMs: 2_000,
          transcript: "The support lead triages it.",
          turnId: 1,
          type: "final-transcript",
        },
        {
          sequence: 2,
          speaker: "assistant",
          timestampMs: 2_100,
          transcript: "Who owns the next handoff?",
          turnId: 1,
          type: "final-transcript",
        },
      ],
    });

    expect(harness.events).toContainEqual({
      speaker: "expert",
      timestampMs: 2_000,
      transcript: "The support lead triages it.",
      turnId: 1,
      type: "final-transcript",
    });
    expect(harness.events).toContainEqual({
      speaker: "assistant",
      timestampMs: 2_100,
      transcript: "Who owns the next handoff?",
      turnId: 1,
      type: "final-transcript",
    });
    expect(harness.events).toContainEqual({
      responseText: "Who owns the next handoff?",
      timestampMs: 2_100,
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
