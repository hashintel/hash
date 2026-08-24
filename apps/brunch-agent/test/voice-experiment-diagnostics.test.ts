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
