import { describe, expect, test } from "vitest";

import {
  createVoiceExperimentDiagnosticsHandler,
  VoiceExperimentDiagnostics,
} from "../src/voice-experiment-diagnostics.ts";

const DIAGNOSTICS_URL =
  "http://brunch.test/api/voice-experiment/elevenlabs-brunch-diagnostics";

describe("voice experiment diagnostics", () => {
  test("exposes only allowlisted, bounded tool metadata", async () => {
    const diagnostics = new VoiceExperimentDiagnostics({
      now: () => 1_234,
    });
    const turnId = diagnostics.beginTurn("voice:conv_safe");

    diagnostics.recordToolCall("voice:conv_safe", turnId, {
      input: {
        question: `Who owns triage?\u0000${"x".repeat(400)}`,
        secret: "must-not-leak",
      },
      toolCallId: "call_ask",
      toolName: "brunch_ask",
    });
    diagnostics.recordToolCall("voice:conv_safe", turnId, {
      input: { apiKey: "sk-private", transcript: "private interview" },
      toolCallId: "call_unknown",
      toolName: "unrecognized_tool",
    });

    const handler = createVoiceExperimentDiagnosticsHandler(diagnostics);
    const response = await handler(
      new Request(`${DIAGNOSTICS_URL}?conversationId=conv_safe`, {
        headers: { "x-voice-experiment": "elevenlabs-brunch" },
      }),
    );
    const body = (await response.json()) as { events: unknown[] };
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.events).toEqual([
      {
        argumentSummary: expect.stringMatching(/^Question: Who owns triage\?/u),
        callId: "call_ask",
        sequence: 1,
        timestampMs: 1_234,
        toolName: "brunch_ask",
        turnId: 1,
      },
      {
        argumentSummary: "Arguments hidden",
        callId: "call_unknown",
        sequence: 2,
        timestampMs: 1_234,
        toolName: "unrecognized_tool",
        turnId: 1,
      },
    ]);
    expect(serialized).not.toContain("must-not-leak");
    expect(serialized).not.toContain("sk-private");
    expect(serialized).not.toContain("private interview");
    expect(serialized).not.toContain("\\u0000");
    expect(serialized.length).toBeLessThan(900);
  });

  test("exposes coalesced transcript events for the voice panel", async () => {
    const diagnostics = new VoiceExperimentDiagnostics({ now: () => 3_000 });
    const turnId = diagnostics.beginTurn("voice:conv_transcript");

    diagnostics.recordTranscript("voice:conv_transcript", {
      isPartial: false,
      speaker: "expert",
      transcript: "The support lead owns triage.",
      turnId,
    });
    diagnostics.recordTranscript("voice:conv_transcript", {
      isPartial: true,
      speaker: "assistant",
      transcript: "Who ",
      turnId,
    });
    diagnostics.recordTranscript("voice:conv_transcript", {
      isPartial: true,
      speaker: "assistant",
      transcript: "Who owns triage?",
      turnId,
    });
    diagnostics.recordTranscript("voice:conv_transcript", {
      isPartial: false,
      speaker: "assistant",
      transcript: "Who owns triage?",
      turnId,
    });

    const handler = createVoiceExperimentDiagnosticsHandler(diagnostics);
    const response = await handler(
      new Request(`${DIAGNOSTICS_URL}?conversationId=conv_transcript`, {
        headers: { "x-voice-experiment": "elevenlabs-brunch" },
      }),
    );
    const body = (await response.json()) as { events: unknown[] };

    expect(body.events).toEqual([
      {
        sequence: 1,
        speaker: "expert",
        timestampMs: 3_000,
        transcript: "The support lead owns triage.",
        turnId: 1,
        type: "final-transcript",
      },
      {
        sequence: 3,
        speaker: "assistant",
        timestampMs: 3_000,
        transcript: "Who owns triage?",
        turnId: 1,
        type: "final-transcript",
      },
    ]);
  });

  test("records the expert utterance and spoken brunch_ask question", async () => {
    const diagnostics = new VoiceExperimentDiagnostics({ now: () => 4_000 });
    const turnId = diagnostics.beginTurn("voice:conv_ask");
    diagnostics.recordTranscript("voice:conv_ask", {
      isPartial: false,
      speaker: "expert",
      transcript: "The support lead owns triage.",
      turnId,
    });
    diagnostics.recordToolCall("voice:conv_ask", turnId, {
      input: { question: "Who owns the next handoff?" },
      toolCallId: "call_ask",
      toolName: "brunch_ask",
    });
    diagnostics.recordTranscript("voice:conv_ask", {
      isPartial: false,
      speaker: "assistant",
      transcript: "Who owns the next handoff?",
      turnId,
    });

    expect(diagnostics.read("conv_ask", 0)).toEqual([
      {
        sequence: 1,
        speaker: "expert",
        timestampMs: 4_000,
        transcript: "The support lead owns triage.",
        turnId: 1,
        type: "final-transcript",
      },
      {
        argumentSummary: "Question: Who owns the next handoff?",
        callId: "call_ask",
        sequence: 2,
        timestampMs: 4_000,
        toolName: "brunch_ask",
        turnId: 1,
      },
      {
        sequence: 3,
        speaker: "assistant",
        timestampMs: 4_000,
        transcript: "Who owns the next handoff?",
        turnId: 1,
        type: "final-transcript",
      },
    ]);
  });

  test("collapses aborted expert retries onto one transcript line", () => {
    const diagnostics = new VoiceExperimentDiagnostics({ now: () => 5_000 });
    diagnostics.recordTranscript("voice:conv_retry", {
      isPartial: false,
      speaker: "expert",
      transcript: "Test elicitation.",
      turnId: diagnostics.beginTurn("voice:conv_retry"),
    });
    diagnostics.recordTranscript("voice:conv_retry", {
      isPartial: false,
      speaker: "expert",
      transcript: "Test, elicitation, one, two, three.",
      turnId: diagnostics.beginTurn("voice:conv_retry"),
    });
    diagnostics.recordTranscript("voice:conv_retry", {
      isPartial: false,
      speaker: "expert",
      transcript: "Test, elicitation, one, two, three.",
      turnId: diagnostics.beginTurn("voice:conv_retry"),
    });
    diagnostics.recordTranscript("voice:conv_retry", {
      isPartial: false,
      speaker: "assistant",
      transcript: "What process are we modelling?",
      turnId: 3,
    });

    expect(diagnostics.read("conv_retry", 0)).toEqual([
      {
        sequence: 2,
        speaker: "expert",
        timestampMs: 5_000,
        transcript: "Test, elicitation, one, two, three.",
        turnId: 2,
        type: "final-transcript",
      },
      {
        sequence: 3,
        speaker: "assistant",
        timestampMs: 5_000,
        transcript: "What process are we modelling?",
        turnId: 3,
        type: "final-transcript",
      },
    ]);
  });

  test("isolates sessions, supports cursors, and rejects untrusted queries", async () => {
    const diagnostics = new VoiceExperimentDiagnostics({ now: () => 2_000 });
    diagnostics.recordToolCall(
      "voice:conv_one",
      diagnostics.beginTurn("voice:conv_one"),
      {
        input: {},
        toolCallId: "call_one",
        toolName: "brunch_sweep",
      },
    );
    diagnostics.recordToolCall(
      "voice:conv_two",
      diagnostics.beginTurn("voice:conv_two"),
      {
        input: {},
        toolCallId: "call_two",
        toolName: "brunch_sweep",
      },
    );

    const handler = createVoiceExperimentDiagnosticsHandler(diagnostics);
    const trusted = { "x-voice-experiment": "elevenlabs-brunch" };
    const response = await handler(
      new Request(`${DIAGNOSTICS_URL}?conversationId=conv_one&after=0`, {
        headers: trusted,
      }),
    );
    const afterResponse = await handler(
      new Request(`${DIAGNOSTICS_URL}?conversationId=conv_one&after=1`, {
        headers: trusted,
      }),
    );
    const forbidden = await handler(
      new Request(`${DIAGNOSTICS_URL}?conversationId=conv_one`),
    );
    const invalid = await handler(
      new Request(`${DIAGNOSTICS_URL}?conversationId=../conv_one`, {
        headers: trusted,
      }),
    );

    expect(await response.json()).toEqual({
      events: [expect.objectContaining({ callId: "call_one", sequence: 1 })],
    });
    expect(await afterResponse.json()).toEqual({ events: [] });
    expect(forbidden.status).toBe(403);
    expect(invalid.status).toBe(400);
  });
});
