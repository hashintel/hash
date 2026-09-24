import { expect, test } from "vitest";

import {
  createTurnChronologyObserver,
  type SubmissionChronology,
} from "../src/agents/chat-agent/live/observe-turn-chronology.ts";

import type { FlueEventContext, FlueObservation } from "@flue/runtime";

const base = "2026-09-15T12:00:00.000Z";
const at = (offsetMs: number): string =>
  new Date(Date.parse(base) + offsetMs).toISOString();

const context = { id: "instance", agentName: "chat" } as FlueEventContext;

let eventIndex = 0;
const event = (
  offsetMs: number,
  variant: Record<string, unknown>,
): FlueObservation =>
  ({
    v: 3,
    eventIndex: eventIndex++,
    timestamp: at(offsetMs),
    instanceId: "instance",
    submissionId: "submission",
    agentName: "chat",
    ...variant,
  }) as unknown as FlueObservation;

const SENTINEL = "SENTINEL-argument-text";

test("one delta then silence reports the silence as last-delta to terminal and never argument text", () => {
  const lines: SubmissionChronology[] = [];
  const observer = createTurnChronologyObserver("chat", (line) =>
    lines.push(line),
  );
  const events: FlueObservation[] = [
    event(0, { type: "turn_start", turnId: "t1", purpose: "prompt" }),
    event(1_200, { type: "thinking_start", turnId: "t1" }),
    event(1_500, {
      type: "toolcall_delta",
      turnId: "t1",
      toolCallId: "call-a",
      toolName: "mutate_workpiece",
      argumentTextDelta: `{"markdown":"${SENTINEL}`,
    }),
    event(1_700, {
      type: "toolcall_delta",
      turnId: "t1",
      toolCallId: "call-a",
      toolName: "mutate_workpiece",
      argumentTextDelta: ` more"}`,
    }),
    // Silence: 20 s until the turn closes.
    event(21_700, {
      type: "turn",
      turnId: "t1",
      purpose: "prompt",
      durationMs: 21_700,
      isError: false,
      request: {},
      response: { usage: { input: 100, output: 20, cacheRead: 90 } },
    }),
    // A second turn that never receives a model event or a `turn`.
    event(22_000, { type: "turn_start", turnId: "t2", purpose: "prompt" }),
    event(22_100, {
      type: "toolcall_delta",
      turnId: "t2",
      toolCallId: "call-b",
      toolName: "read_workpiece",
      argumentTextDelta: "{",
    }),
    // A different agent's event must be ignored.
    event(22_200, {
      type: "turn_start",
      turnId: "other",
      purpose: "prompt",
      agentName: "persona",
    }),
    event(52_100, {
      type: "submission_settled",
      submissionId: "submission",
      outcome: "aborted",
    }),
  ];
  for (const observed of events) void observer.observe(observed, context);

  expect(lines).toHaveLength(1);
  const [line] = lines;
  expect(JSON.stringify(line)).not.toContain(SENTINEL);
  expect(line).toEqual({
    submissionId: "submission",
    outcome: "aborted",
    turns: [
      {
        turnId: "t1",
        purpose: "prompt",
        timeToFirstEventMs: 1_200,
        durationMs: 21_700,
        terminal: "turn",
        isError: false,
        inputTokens: 100,
        cacheReadTokens: 90,
        outputTokens: 20,
        requestShape: null,
        responseShape: {
          finishReason: null,
          textParts: 0,
          textChars: 0,
          thinkingParts: 0,
          thinkingChars: 0,
          toolCallParts: 0,
        },
        toolCalls: [
          {
            toolCallId: "call-a",
            toolName: "mutate_workpiece",
            firstDeltaMs: 1_500,
            lastDeltaMs: 1_700,
            deltaCount: 2,
            argumentChars: `{"markdown":"${SENTINEL}`.length + ` more"}`.length,
            maxGapMs: 200,
            lastDeltaToTerminalMs: 20_000,
          },
        ],
      },
      {
        turnId: "t2",
        purpose: "prompt",
        timeToFirstEventMs: 100,
        durationMs: 30_100,
        terminal: "settlement",
        isError: null,
        inputTokens: null,
        cacheReadTokens: null,
        outputTokens: null,
        requestShape: null,
        responseShape: null,
        toolCalls: [
          {
            toolCallId: "call-b",
            toolName: "read_workpiece",
            firstDeltaMs: 100,
            lastDeltaMs: 100,
            deltaCount: 1,
            argumentChars: 1,
            maxGapMs: 0,
            lastDeltaToTerminalMs: 30_000,
          },
        ],
      },
    ],
  });

  // Settlement clears the submission; a later settlement for it is empty.
  void observer.observe(
    event(60_000, {
      type: "submission_settled",
      submissionId: "submission",
      outcome: "completed",
    }),
    context,
  );
  expect(lines[1]).toEqual({
    submissionId: "submission",
    outcome: "completed",
    turns: [],
  });
});

test("a read-then-empty completion records context and response shapes without content", () => {
  const lines: SubmissionChronology[] = [];
  const observer = createTurnChronologyObserver("chat", (line) =>
    lines.push(line),
  );
  for (const observed of [
    event(0, { type: "turn_start", turnId: "t1", purpose: "agent" }),
    event(10, {
      type: "turn_request",
      turnId: "t1",
      purpose: "agent",
      request: {
        input: {
          messages: [
            { role: "user", content: SENTINEL },
            { role: "user", content: "net-stale signal" },
            {
              role: "toolResult",
              toolCallId: "read",
              toolName: "getLatestNetDefinition",
              content: [{ type: "text", text: "private document" }],
              isError: false,
            },
          ],
        },
      },
    }),
    event(30, {
      type: "turn",
      turnId: "t1",
      isError: false,
      response: {
        finishReason: "stop",
        output: { role: "assistant", content: [] },
        usage: { input: 3, output: 4, cacheRead: 37_000 },
      },
    }),
    event(35, { type: "submission_settled", outcome: "completed" }),
  ])
    void observer.observe(observed, context);

  expect(lines[0]?.turns[0]).toMatchObject({
    requestShape: {
      messages: 3,
      userMessages: 2,
      toolResults: 1,
      firstUserTextChars: SENTINEL.length,
    },
    responseShape: {
      finishReason: "stop",
      textParts: 0,
      textChars: 0,
      thinkingParts: 0,
      thinkingChars: 0,
      toolCallParts: 0,
    },
  });
  expect(JSON.stringify(lines)).not.toContain(SENTINEL);
  expect(JSON.stringify(lines)).not.toContain("private document");
});

test("a turn with no model events is reported with a null time to first event", () => {
  const lines: SubmissionChronology[] = [];
  const observer = createTurnChronologyObserver("chat", (line) =>
    lines.push(line),
  );
  void observer.observe(
    event(0, { type: "turn_start", turnId: "t1", purpose: "prompt" }),
    context,
  );
  void observer.observe(
    event(5_000, {
      type: "turn",
      turnId: "t1",
      purpose: "prompt",
      durationMs: 5_000,
      isError: true,
      request: {},
      response: {},
    }),
    context,
  );
  void observer.observe(
    event(5_100, {
      type: "submission_settled",
      submissionId: "submission",
      outcome: "failed",
    }),
    context,
  );
  expect(lines[0]?.turns).toEqual([
    expect.objectContaining({
      turnId: "t1",
      timeToFirstEventMs: null,
      durationMs: 5_000,
      terminal: "turn",
      isError: true,
      toolCalls: [],
    }),
  ]);
});
