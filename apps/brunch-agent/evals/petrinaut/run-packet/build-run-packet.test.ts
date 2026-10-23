import { expect, test } from "vitest";

import { petrinautContextualUserMessageBody } from "@hashintel/brunch-agent";

import { buildRunPacket, type StreamEvent } from "./build-run-packet.ts";
import { renderRunPacket } from "./render-run-packet.ts";

import type { LoggedSubmissionChronology } from "./parse-chronology-log.ts";

const t0 = Date.parse("2026-10-15T10:00:00.000Z");

const event = (
  type: string,
  offsetMs: number,
  payload: Record<string, unknown> = {},
  submissionId = "sub-1",
): StreamEvent => ({
  type,
  at: t0 + offsetMs,
  submissionId,
  payload: {
    type,
    timestamp: new Date(t0 + offsetMs).toISOString(),
    ...payload,
  },
});

const placeResult = {
  brunchBrowserResult: true,
  output: { applied: true },
  metadata: {
    documentRevision: { before: "a", after: "b" },
    readBack: {
      places: [{ id: "p1" }, { id: "p2" }],
      transitions: [{ id: "t1", inputArcs: [{}], outputArcs: [{}] }],
    },
  },
};

// Step 1 builds and commits; step 2 replies.
const events: StreamEvent[] = [
  event("user_message", 0, {
    content: [{ type: "text", text: "We run  two\nbays." }],
  }),
  event("agent_start_run", 100),
  event("assistant_message_started", 1_100, { turnId: "turn-1" }),
  event("assistant_tool_call", 9_000, {
    turnId: "turn-1",
    toolCallId: "call-place",
    name: "addPlace",
    arguments: { name: "Bay" },
  }),
  event("assistant_tool_call", 9_000, {
    turnId: "turn-1",
    toolCallId: "call-commit",
    name: "ledger_commit",
    arguments: { entities: [] },
  }),
  event("assistant_message_completed", 9_100, {
    turnId: "turn-1",
    usage: {
      input: 3,
      output: 200,
      cacheRead: 1_000,
      cacheWrite: 50,
      reasoning: 120,
      cost: { total: 0.01 },
    },
  }),
  event("tool_outcome", 9_400, {
    toolCallId: "call-place",
    toolName: "addPlace",
    isError: false,
    durationMs: 250,
    output: placeResult,
  }),
  event("tool_outcome", 9_150, {
    toolCallId: "call-commit",
    toolName: "ledger_commit",
    isError: false,
    durationMs: 5,
    output: { status: "recorded", ids: ["e1", "e2", "c1"] },
  }),
  event("tool_results_committed", 9_500, { turnId: "turn-1" }),
  event("assistant_message_started", 10_500, { turnId: "turn-2" }),
  event("assistant_reasoning_started", 11_000, { blockId: "r1" }),
  event("assistant_reasoning_completed", 13_000, { blockId: "r1" }),
  event("assistant_text_started", 15_500, { blockId: "x1" }),
  event("assistant_text_completed", 17_500, { blockId: "x1" }),
  event("assistant_message_completed", 17_600, {
    turnId: "turn-2",
    usage: { input: 2, output: 80, cacheRead: 1_200, cacheWrite: 0 },
  }),
  event("submission_settled", 17_800, { outcome: "completed" }),
];

const chronology: LoggedSubmissionChronology = {
  submissionId: "sub-1",
  outcome: "completed",
  turns: [
    {
      turnId: "turn-1",
      purpose: "agent",
      // With the run's start, so deltas from either origin coincide.
      startedAt: new Date(t0 + 100).toISOString(),
      timeToFirstEventMs: 1_000,
      durationMs: 9_000,
      terminal: "turn",
      isError: false,
      inputTokens: 3,
      cacheReadTokens: 1_000,
      outputTokens: 200,
      requestShape: null,
      responseShape: null,
      toolCalls: [
        {
          toolCallId: "call-place",
          toolName: "addPlace",
          firstDeltaMs: 6_000,
          lastDeltaMs: 6_500,
          deltaCount: 10,
          argumentChars: 40,
          maxGapMs: 100,
          lastDeltaToTerminalMs: 0,
        },
        {
          toolCallId: "call-commit",
          toolName: "ledger_commit",
          firstDeltaMs: 6_600,
          lastDeltaMs: 8_900,
          deltaCount: 300,
          argumentChars: 3_600,
          maxGapMs: 100,
          lastDeltaToTerminalMs: 0,
        },
      ],
    },
  ],
};

const input = {
  label: "run-test",
  metadata: null,
  submissions: [
    { submissionId: "sub-1", acceptedAt: t0, settledAt: t0 + 18_000 },
    { submissionId: "sub-2", acceptedAt: t0 + 30_000, settledAt: t0 + 31_000 },
  ],
  events: [
    ...events,
    event("agent_start_run", 30_000, {}, "sub-2"),
    event("assistant_message_started", 30_200, { turnId: "turn-3" }, "sub-2"),
    event(
      "assistant_tool_call",
      30_400,
      {
        toolCallId: "call-approve",
        name: "applyAutoLayout",
        arguments: { askUserFirst: true },
      },
      "sub-2",
    ),
    event("assistant_message_completed", 30_500, { turnId: "turn-3" }, "sub-2"),
    event(
      "tool_outcome",
      30_900,
      {
        toolCallId: "call-approve",
        isError: false,
        durationMs: 45_000,
      },
      "sub-2",
    ),
    event("tool_results_committed", 30_900, {}, "sub-2"),
  ],
  chronology: new Map([["sub-1", chronology]]),
  skipped: { batches: 0, events: 0, chronologyLines: 0 },
  finalLedger: null,
  finalNet: null,
};

test("an exchange's wall time splits into hidden reasoning, argument streaming, reply text and tool phases", () => {
  const packet = buildRunPacket(input);
  const [exchange] = packet.exchanges;

  expect(exchange).toMatchObject({
    index: 1,
    userExcerpt: "We run two bays.",
    outcome: "completed",
    wallMs: 18_000,
    untilFirstTextMs: 15_500,
    toolPhaseMs: 400,
    stepShape: ["ledger+net-change", "reply"],
  });
  expect(exchange?.steps).toMatchObject([
    {
      durationMs: 9_000,
      // The first argument delta, 6 s after the request.
      beforeOutputMs: 6_000,
      argumentStreamingMs: 2_900,
      toolPhaseMs: 400,
    },
    {
      durationMs: 8_100,
      beforeOutputMs: 6_000,
      reasoningSummaryMs: 2_000,
      textMs: 2_000,
      argumentStreamingMs: null,
      toolPhaseMs: 0,
    },
  ]);
  expect(exchange?.modelMs).toBe(17_100);
  expect(exchange?.otherMs).toBe(500);
});

test("tool calls are categorised, and Ledger commits counted with their argument size", () => {
  const [exchange] = buildRunPacket(input).exchanges;

  expect(exchange?.categories.ledger).toEqual({
    calls: 1,
    executionMs: 5,
    argumentChars: 3_600,
  });
  expect(exchange?.categories["net-change"].calls).toBe(1);
  expect(exchange?.ledger).toEqual({
    commits: 1,
    recorded: 1,
    refused: 0,
    recordsAdded: 3,
    argumentChars: 3_600,
  });
  expect(exchange?.netChanges).toBe(1);
  expect(exchange?.netAfter).toEqual({ places: 2, transitions: 1, arcs: 2 });
  expect(exchange?.usage).toMatchObject({
    outputTokens: 280,
    cacheWriteTokens: 50,
    costUsd: 0.01,
  });
});

test("an approval wait is kept out of Brunch's active time", () => {
  const packet = buildRunPacket(input);
  const second = packet.exchanges[1];

  expect(second).toMatchObject({
    thinkTimeBeforeMs: 12_000,
    longToolCalls: [{ name: "applyAutoLayout", executionMs: 45_000 }],
    approvalWaitMs: 400,
    activeMs: 600,
    // Net size carries over from the exchange that last showed it.
    netAfter: { places: 2, transitions: 1, arcs: 2 },
  });
  expect(packet.summary).toMatchObject({
    exchanges: 2,
    wallMs: 19_000,
    activeMs: 18_600,
    steps: 3,
    stepsByToolCount: { none: 1, one: 1, several: 1 },
    ledgerCommits: 1,
    longToolCalls: 1,
  });
});

test("an approval stopped before its tool returned is kept out of active time", () => {
  const packet = buildRunPacket({
    ...input,
    submissions: [
      { submissionId: "stop", acceptedAt: t0, settledAt: t0 + 60_000 },
    ],
    events: [
      event("agent_start_run", 0, {}, "stop"),
      event("assistant_message_started", 200, { turnId: "turn-a" }, "stop"),
      event(
        "assistant_tool_call",
        400,
        { toolCallId: "call-remove", name: "removeElements", arguments: {} },
        "stop",
      ),
      event("assistant_message_completed", 1_000, { turnId: "turn-a" }, "stop"),
      event("submission_settled", 60_000, { outcome: "aborted" }, "stop"),
    ],
    chronology: new Map(),
  });
  const [exchange] = packet.exchanges;

  expect(exchange?.steps).toMatchObject([
    { durationMs: 1_000, toolPhaseMs: 59_000, cutOffIn: "tools" },
  ]);
  expect(exchange).toMatchObject({
    outcome: "aborted",
    wallMs: 60_000,
    approvalWaitMs: 59_000,
    activeMs: 1_000,
  });
  expect(packet.summary.incomplete).toEqual({
    unsettledExchanges: 0,
    cutOffMessages: 0,
    cutOffToolPhases: 1,
  });
});

test("a message cut off mid-stream keeps its model time up to settlement", () => {
  const packet = buildRunPacket({
    ...input,
    submissions: [
      { submissionId: "stop", acceptedAt: t0, settledAt: t0 + 5_000 },
    ],
    events: [
      event("agent_start_run", 0, {}, "stop"),
      event("assistant_message_started", 100, { turnId: "turn-a" }, "stop"),
      event("assistant_text_started", 2_000, { blockId: "x1" }, "stop"),
      event("submission_settled", 5_000, { outcome: "aborted" }, "stop"),
    ],
    chronology: new Map(),
  });
  const [exchange] = packet.exchanges;

  expect(exchange?.steps).toMatchObject([
    { durationMs: 5_000, toolPhaseMs: 0, cutOffIn: "message" },
  ]);
  expect(exchange).toMatchObject({ modelMs: 5_000, otherMs: 0 });
  expect(packet.summary.incomplete.cutOffMessages).toBe(1);
});

test("a step after a cut-off one starts where the cut-off one ends, so no span counts twice", () => {
  const packet = buildRunPacket({
    ...input,
    submissions: [
      { submissionId: "gap", acceptedAt: t0, settledAt: t0 + 10_000 },
    ],
    events: [
      event("agent_start_run", 0, {}, "gap"),
      // Cut off in its tools: no `tool_results_committed` follows.
      event("assistant_message_started", 200, { turnId: "turn-a" }, "gap"),
      event(
        "assistant_tool_call",
        400,
        { toolCallId: "call-a", name: "addPlace", arguments: {} },
        "gap",
      ),
      event("assistant_message_completed", 1_000, { turnId: "turn-a" }, "gap"),
      // Cut off mid-message: no `assistant_message_completed` follows.
      event("assistant_message_started", 3_000, { turnId: "turn-b" }, "gap"),
      event("assistant_message_started", 6_000, { turnId: "turn-c" }, "gap"),
      event("assistant_message_completed", 9_000, { turnId: "turn-c" }, "gap"),
      event("submission_settled", 10_000, { outcome: "completed" }, "gap"),
    ],
    chronology: new Map(),
  });
  const [exchange] = packet.exchanges;

  expect(exchange?.steps).toMatchObject([
    { durationMs: 1_000, toolPhaseMs: 2_000, cutOffIn: "tools" },
    { durationMs: 3_000, toolPhaseMs: 0, cutOffIn: "message" },
    { durationMs: 3_000, toolPhaseMs: 0, cutOffIn: null },
  ]);
  expect(exchange).toMatchObject({
    wallMs: 10_000,
    modelMs: 7_000,
    toolPhaseMs: 2_000,
    otherMs: 1_000,
  });
});

test("an unsettled exchange is counted but left out of the time sums, and the packet says so", () => {
  const complete = buildRunPacket(input);
  const packet = buildRunPacket({
    ...input,
    submissions: [
      ...input.submissions,
      { submissionId: "sub-3", acceptedAt: t0 + 40_000, settledAt: null },
    ],
    events: [
      ...input.events,
      event("agent_start_run", 40_000, {}, "sub-3"),
      event("assistant_message_started", 40_100, { turnId: "turn-4" }, "sub-3"),
      event(
        "assistant_message_completed",
        45_000,
        { turnId: "turn-4", usage: { output: 10 } },
        "sub-3",
      ),
    ],
    skipped: { batches: 1, events: 0, chronologyLines: 0 },
  });

  expect(packet.version).toBe(2);
  expect(packet.sources.skipped).toEqual({
    batches: 1,
    events: 0,
    chronologyLines: 0,
  });
  expect(packet.summary).toMatchObject({
    exchanges: 3,
    incomplete: { unsettledExchanges: 1 },
    steps: 4,
    wallMs: complete.summary.wallMs,
    activeMs: complete.summary.activeMs,
    modelMs: complete.summary.modelMs,
    usage: { outputTokens: complete.summary.usage.outputTokens + 10 },
  });

  const markdown = renderRunPacket(packet);
  expect(markdown).toContain(
    "- Incomplete run: 1 exchange never settled, left out of the time sums; 1 stream batch unreadable, skipped.",
  );
  expect(markdown).toContain("| 3 (unsettled) |");
});

test("without a chronology, argument streaming is unknown rather than zero", () => {
  const packet = buildRunPacket({ ...input, chronology: new Map() });

  expect(packet.sources.chronology).toBe(false);
  expect(packet.summary.argumentStreamingMs).toBeNull();
  expect(packet.exchanges[0]?.steps[0]?.argumentStreamingMs).toBeNull();
  // The db's tool calls arrive with the completed message, so the step's
  // output is only known to start at its end.
  expect(packet.exchanges[0]?.steps[0]?.beforeOutputMs).toBe(9_000);
});

test("a skill activated again is a reload, marked when a compaction came between", () => {
  const activation = (offsetMs: number, submissionId: string, id: string) => [
    event("assistant_message_started", offsetMs, {}, submissionId),
    event(
      "assistant_tool_call",
      offsetMs,
      {
        toolCallId: id,
        name: "activate_skill",
        arguments: { name: "eliciting" },
      },
      submissionId,
    ),
  ];
  const packet = buildRunPacket({
    ...input,
    submissions: [
      { submissionId: "a", acceptedAt: t0, settledAt: t0 + 10 },
      { submissionId: "b", acceptedAt: t0 + 20, settledAt: t0 + 30 },
      { submissionId: "c", acceptedAt: t0 + 40, settledAt: t0 + 50 },
    ],
    events: [
      ...activation(1, "a", "call-a"),
      ...activation(21, "b", "call-b"),
      event("compaction", 41, { tokensBefore: 180_000 }, "c"),
      ...activation(42, "c", "call-c"),
    ],
    chronology: new Map(),
  });

  expect(packet.exchanges.map((exchange) => exchange.skillReloads)).toEqual([
    [],
    [{ name: "eliciting", afterCompaction: false }],
    [{ name: "eliciting", afterCompaction: true }],
  ]);
  expect(packet.exchanges[2]?.compactions).toEqual([{ tokensBefore: 180_000 }]);
  expect(packet.summary).toMatchObject({
    skillReloads: 2,
    skillReloadsAfterCompaction: 1,
    compactions: 1,
  });
});

const chronologyTurn = (
  turnId: string,
  startedAt: number | undefined,
  toolCalls: readonly {
    toolCallId: string;
    firstDeltaMs: number;
    lastDeltaMs: number;
  }[],
): LoggedSubmissionChronology["turns"][number] => ({
  turnId,
  purpose: "agent",
  ...(startedAt === undefined
    ? {}
    : { startedAt: new Date(t0 + startedAt).toISOString() }),
  timeToFirstEventMs: null,
  durationMs: 0,
  terminal: "turn",
  isError: false,
  inputTokens: null,
  cacheReadTokens: null,
  outputTokens: null,
  requestShape: null,
  responseShape: null,
  toolCalls: toolCalls.map((call) => ({
    ...call,
    toolName: "addPlace",
    deltaCount: 2,
    argumentChars: 10,
    maxGapMs: 0,
    lastDeltaToTerminalMs: 0,
  })),
});

// Each turn starts after its step's request: 500 ms after the run starts,
// and 500 ms after the first step's tool results are committed.
const offsetEvents: StreamEvent[] = [
  event("agent_start_run", 100, {}, "offset"),
  event("assistant_message_started", 1_000, { turnId: "turn-a" }, "offset"),
  event("assistant_text_started", 3_000, { blockId: "xa" }, "offset"),
  event("assistant_text_completed", 3_100, { blockId: "xa" }, "offset"),
  event(
    "assistant_tool_call",
    3_200,
    { toolCallId: "call-a", name: "addPlace", arguments: {} },
    "offset",
  ),
  event("assistant_message_completed", 3_200, { turnId: "turn-a" }, "offset"),
  event("tool_results_committed", 3_500, {}, "offset"),
  event("assistant_message_started", 4_500, { turnId: "turn-b" }, "offset"),
  event("assistant_text_started", 7_000, { blockId: "xb" }, "offset"),
  event("assistant_text_completed", 7_100, { blockId: "xb" }, "offset"),
  event(
    "assistant_tool_call",
    7_200,
    { toolCallId: "call-b", name: "addPlace", arguments: {} },
    "offset",
  ),
  event("assistant_message_completed", 7_200, { turnId: "turn-b" }, "offset"),
  event("tool_results_committed", 7_300, {}, "offset"),
  event("submission_settled", 7_400, { outcome: "completed" }, "offset"),
];

const offsetPacket = (withStartedAt: boolean) =>
  buildRunPacket({
    ...input,
    submissions: [
      { submissionId: "offset", acceptedAt: t0, settledAt: t0 + 7_400 },
    ],
    events: offsetEvents,
    chronology: new Map([
      [
        "offset",
        {
          submissionId: "offset",
          outcome: "completed",
          turns: [
            chronologyTurn("turn-a", withStartedAt ? 600 : undefined, [
              { toolCallId: "call-a", firstDeltaMs: 400, lastDeltaMs: 1_400 },
            ]),
            chronologyTurn("turn-b", withStartedAt ? 4_000 : undefined, [
              { toolCallId: "call-b", firstDeltaMs: 1_000, lastDeltaMs: 2_000 },
            ]),
          ],
        },
      ],
    ]),
  });

test("the first step's tool-argument deltas are measured from the run's start, not the turn's", () => {
  const [step] = offsetPacket(true).exchanges[0]?.steps ?? [];

  expect(step).toMatchObject({
    // The turn starts 500 ms after the run; its first delta 400 ms later.
    beforeOutputMs: 900,
    argumentStreamingMs: 1_000,
    toolCalls: [{ firstDeltaMs: 900, lastDeltaMs: 1_900 }],
  });
});

test("a later step's tool-argument deltas are measured from the committed tool results, not the turn's start", () => {
  const step = offsetPacket(true).exchanges[0]?.steps[1];

  expect(step).toMatchObject({
    // The turn starts 500 ms after the commit; its first delta 1 s later.
    beforeOutputMs: 1_500,
    argumentStreamingMs: 1_000,
    toolCalls: [{ firstDeltaMs: 1_500, lastDeltaMs: 2_500 }],
  });
});

test("a chronology logged without turn start times leaves tool deltas unplaced but still measures their streaming", () => {
  const steps = offsetPacket(false).exchanges[0]?.steps;

  expect(steps).toMatchObject([
    {
      // Reply text only: 2.9 s after the run started.
      beforeOutputMs: 2_900,
      argumentStreamingMs: 1_000,
      toolCalls: [{ firstDeltaMs: null, lastDeltaMs: null }],
    },
    {
      beforeOutputMs: 3_500,
      argumentStreamingMs: 1_000,
      toolCalls: [{ firstDeltaMs: null, lastDeltaMs: null }],
    },
  ]);
});

test("a user message sent with submission context is excerpted as the user's own text", () => {
  const packet = buildRunPacket({
    ...input,
    submissions: [
      { submissionId: "context", acceptedAt: t0, settledAt: t0 + 100 },
    ],
    events: [
      event(
        "user_message",
        0,
        {
          content: [
            {
              type: "text",
              text: petrinautContextualUserMessageBody({
                userText: "We run  two\nbays.",
                diagnosticsContext: "",
                submissionContext: { interviewLength: "short" },
              }),
            },
          ],
        },
        "context",
      ),
    ],
    chronology: new Map(),
  });

  expect(packet.exchanges[0]?.userExcerpt).toBe("We run two bays.");
});
