import { brunchTools, petrinautUserMessageText } from "@hashintel/brunch-agent";

import {
  type ToolCategory,
  toolCategories,
  toolCategoryOf,
} from "./tool-categories.ts";

import type { LoggedSubmissionChronology } from "./parse-chronology-log.ts";

/** One conversation-stream event, with its parsed timestamp. */
export interface StreamEvent {
  readonly type: string;
  readonly at: number;
  readonly submissionId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface RunSubmission {
  readonly submissionId: string;
  readonly acceptedAt: number;
  readonly settledAt: number | null;
}

export interface RunMetadata {
  readonly caseName: string | null;
  readonly brunchModel: string | null;
  readonly brunchThinking: string | null;
  readonly personaAgent: string | null;
  readonly guidanceSha256: string | null;
  readonly createdAt: string | null;
}

export interface NetSize {
  readonly places: number;
  readonly transitions: number;
  readonly arcs: number;
}

export interface FinalNetSummary extends NetSize {
  readonly tokenTypes: number;
  readonly colouredPlaces: number;
  readonly parameters: number;
  readonly differentialEquations: number;
  readonly metrics: number;
  readonly scenarios: number;
}

export interface FinalLedgerSummary {
  readonly acceptedCommits: number;
  readonly entities: number;
  readonly claims: number;
  readonly obligations: number;
}

/** Stored records the reader could not use, and so left out of the packet. */
export interface SkippedRecords {
  /** Conversation-stream batches whose data did not parse. */
  readonly batches: number;
  /** Events without a type or timestamp. */
  readonly events: number;
  /** Server-log chronology lines that did not parse. */
  readonly chronologyLines: number;
}

export interface RunPacketInput {
  readonly label: string;
  readonly metadata: RunMetadata | null;
  readonly submissions: readonly RunSubmission[];
  readonly events: readonly StreamEvent[];
  /** Server-log chronology by submission; absent when the run kept no server log. */
  readonly chronology: ReadonlyMap<string, LoggedSubmissionChronology>;
  readonly skipped: SkippedRecords;
  readonly finalLedger: FinalLedgerSummary | null;
  readonly finalNet: FinalNetSummary | null;
}

export interface Usage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly reasoningTokens: number;
  readonly costUsd: number;
}

export interface PacketToolCall {
  readonly toolCallId: string;
  readonly name: string;
  readonly category: ToolCategory;
  readonly argumentChars: number;
  /**
   * From the server-log chronology: milliseconds from the step's request to
   * the first and last argument delta. Null without a chronology, or when it
   * predates turn start times and so cannot place its deltas.
   */
  readonly firstDeltaMs: number | null;
  readonly lastDeltaMs: number | null;
  readonly executionMs: number | null;
  readonly isError: boolean | null;
}

export interface PacketStep {
  readonly turnId: string;
  /**
   * Request sent (the previous step's tool results committed, or the run
   * started) to message completed. A message that never completed ends where
   * the next step starts, or else at settlement or the exchange's last event.
   */
  readonly durationMs: number;
  /**
   * Request sent to the first reply text or tool-argument delta: hidden
   * reasoning, time to first event and any reasoning summary. Tool-argument
   * deltas count only when the chronology places them (see `firstDeltaMs`).
   */
  readonly beforeOutputMs: number;
  readonly reasoningSummaryMs: number;
  readonly textMs: number;
  /** First to last tool-argument delta; null without a server-log chronology. */
  readonly argumentStreamingMs: number | null;
  /**
   * Message completed to tool results committed: execution, browser round
   * trips and approval waits. Tools never committed end where the message
   * would.
   */
  readonly toolPhaseMs: number;
  /** Where the step was cut off: before its message completed, before its tool results were committed, or not at all. */
  readonly cutOffIn: "message" | "tools" | null;
  readonly toolCalls: readonly PacketToolCall[];
  readonly usage: Usage;
}

export interface CategoryTotals {
  readonly calls: number;
  readonly executionMs: number;
  readonly argumentChars: number;
}

export interface PacketExchange {
  readonly index: number;
  readonly submissionId: string;
  readonly outcome: string | null;
  readonly userExcerpt: string;
  /** Previous settlement to this submission's acceptance: the person's (or persona's) time to answer. */
  readonly thinkTimeBeforeMs: number | null;
  readonly wallMs: number | null;
  /** Acceptance to the first reply text: what the person waits before reading anything. */
  readonly untilFirstTextMs: number | null;
  readonly modelMs: number;
  readonly beforeOutputMs: number;
  readonly argumentStreamingMs: number | null;
  readonly textMs: number;
  readonly toolPhaseMs: number;
  readonly otherMs: number | null;
  readonly steps: readonly PacketStep[];
  readonly categories: Readonly<Record<ToolCategory, CategoryTotals>>;
  readonly skillActivations: readonly string[];
  /** Activations of a skill already activated earlier in the run, and whether a compaction came between. */
  readonly skillReloads: readonly { name: string; afterCompaction: boolean }[];
  readonly skillResourceReads: readonly string[];
  /** Context compactions during the exchange, with the estimated context size that triggered each. */
  readonly compactions: readonly { tokensBefore: number | null }[];
  readonly ledger: {
    readonly commits: number;
    readonly recorded: number;
    readonly refused: number;
    readonly recordsAdded: number;
    readonly argumentChars: number;
  };
  readonly netChanges: number;
  readonly netAfter: NetSize | null;
  /** Tool calls that took at least `longToolCallMs`, usually waiting on the person's approval. */
  readonly longToolCalls: readonly { name: string; executionMs: number }[];
  /**
   * Tool phases of the steps holding a long tool call, or cut off at least
   * `longToolCallMs` into tools that never returned.
   */
  readonly approvalWaitMs: number;
  /** Wall time less approval waits: what Brunch itself spent. */
  readonly activeMs: number | null;
  /** Each step's tool categories (`+`-joined, led by `text` when it also wrote reply text), or `reply` for a step without tools. */
  readonly stepShape: readonly string[];
  readonly usage: Usage;
}

export interface Distribution {
  readonly median: number | null;
  readonly p90: number | null;
  readonly max: number | null;
}

export interface RunPacket {
  readonly version: 2;
  readonly label: string;
  readonly metadata: RunMetadata | null;
  readonly sources: {
    readonly chronology: boolean;
    readonly skipped: SkippedRecords;
  };
  /**
   * Time sums cover settled exchanges only, since an unsettled exchange has no
   * wall or active time to share them against. Counts, usage and
   * distributions of first-text time cover every exchange.
   */
  readonly summary: {
    readonly exchanges: number;
    readonly incomplete: {
      /** Exchanges with no settlement, left out of the time sums. */
      readonly unsettledExchanges: number;
      /** Steps whose message never completed. */
      readonly cutOffMessages: number;
      /** Steps whose tool results were never committed. */
      readonly cutOffToolPhases: number;
    };
    readonly wallMs: number;
    readonly approvalWaitMs: number;
    /** Wall time less approval waits; shares and distributions use it. */
    readonly activeMs: number;
    readonly activePerExchangeMs: Distribution;
    readonly untilFirstTextMs: Distribution;
    readonly steps: number;
    readonly stepsPerExchange: number | null;
    readonly stepsByToolCount: {
      readonly none: number;
      readonly one: number;
      readonly several: number;
    };
    readonly modelMs: number;
    readonly beforeOutputMs: number;
    readonly argumentStreamingMs: number | null;
    readonly textMs: number;
    readonly toolPhaseMs: number;
    readonly categories: Readonly<Record<ToolCategory, CategoryTotals>>;
    readonly skillActivations: Readonly<Record<string, number>>;
    readonly skillReloads: number;
    readonly skillReloadsAfterCompaction: number;
    readonly skillResourceReads: number;
    readonly compactions: number;
    readonly ledgerCommits: number;
    readonly ledgerRefused: number;
    readonly ledgerArgumentChars: number;
    readonly longToolCalls: number;
    readonly usage: Usage;
  };
  readonly finalLedger: FinalLedgerSummary | null;
  readonly finalNet: FinalNetSummary | null;
  readonly exchanges: readonly PacketExchange[];
}

const longToolCallMs = 30_000;

const zeroUsage: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
  costUsd: 0,
};

const addUsage = (left: Usage, right: Usage): Usage => ({
  inputTokens: left.inputTokens + right.inputTokens,
  outputTokens: left.outputTokens + right.outputTokens,
  cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
  cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
  reasoningTokens: left.reasoningTokens + right.reasoningTokens,
  costUsd: left.costUsd + right.costUsd,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const numberField = (record: unknown, key: string): number => {
  if (!isRecord(record)) return 0;
  const value = record[key];
  return typeof value === "number" ? value : 0;
};

const stringField = (record: unknown, key: string): string | undefined => {
  if (!isRecord(record)) return undefined;
  const value = record[key];
  return typeof value === "string" ? value : undefined;
};

const usageOf = (payload: Readonly<Record<string, unknown>>): Usage => {
  const usage = payload.usage;
  return {
    inputTokens: numberField(usage, "input"),
    outputTokens: numberField(usage, "output"),
    cacheReadTokens: numberField(usage, "cacheRead"),
    cacheWriteTokens: numberField(usage, "cacheWrite"),
    reasoningTokens: numberField(usage, "reasoning"),
    costUsd: isRecord(usage) ? numberField(usage.cost, "total") : 0,
  };
};

const emptyCategories = (): Record<ToolCategory, CategoryTotals> =>
  Object.fromEntries(
    toolCategories.map((category) => [
      category,
      { calls: 0, executionMs: 0, argumentChars: 0 },
    ]),
  ) as Record<ToolCategory, CategoryTotals>;

const addCategories = (
  left: Readonly<Record<ToolCategory, CategoryTotals>>,
  right: Readonly<Record<ToolCategory, CategoryTotals>>,
): Record<ToolCategory, CategoryTotals> =>
  Object.fromEntries(
    toolCategories.map((category) => [
      category,
      {
        calls: left[category].calls + right[category].calls,
        executionMs: left[category].executionMs + right[category].executionMs,
        argumentChars:
          left[category].argumentChars + right[category].argumentChars,
      },
    ]),
  ) as Record<ToolCategory, CategoryTotals>;

/** Net size from a browser result's read-back or definition, when it carries one. */
export const netSizeOf = (output: unknown): NetSize | null => {
  if (!isRecord(output)) return null;
  const metadata = output.metadata;
  const inner = output.output;
  const definition =
    (isRecord(metadata) ? metadata.readBack : undefined) ??
    (isRecord(inner) ? inner.definition : undefined);
  if (!isRecord(definition) || !Array.isArray(definition.places)) return null;
  const transitions = Array.isArray(definition.transitions)
    ? definition.transitions
    : [];
  const arcs = transitions.reduce<number>((total, transition) => {
    if (!isRecord(transition)) return total;
    const inputs = Array.isArray(transition.inputArcs)
      ? transition.inputArcs.length
      : 0;
    const outputs = Array.isArray(transition.outputArcs)
      ? transition.outputArcs.length
      : 0;
    return total + inputs + outputs;
  }, 0);
  return {
    places: definition.places.length,
    transitions: transitions.length,
    arcs,
  };
};

const changedDocument = (output: unknown): boolean => {
  if (!isRecord(output) || !isRecord(output.metadata)) return false;
  const revision = output.metadata.documentRevision;
  if (!isRecord(revision)) return false;
  return (
    typeof revision.after === "string" && revision.after !== revision.before
  );
};

const skillResourcePath = (path: string): string => {
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // Keep the raw path.
  }
  const match = /\/packaged-skills\/skill:([^/:]+):[^/]+\/(.+)$/u.exec(decoded);
  return match?.[1] !== undefined && match[2] !== undefined
    ? `${match[1]}/${match[2]}`
    : path;
};

const userExcerptOf = (payload: Readonly<Record<string, unknown>>): string => {
  const content = payload.content;
  if (!Array.isArray(content)) return "";
  const text = petrinautUserMessageText(
    content.map((part) => stringField(part, "text") ?? "").join(" "),
  )
    .replace(/\s+/gu, " ")
    .trim();
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
};

const distributionOf = (values: readonly number[]): Distribution => {
  if (values.length === 0) return { median: null, p90: null, max: null };
  const sorted = [...values].sort((left, right) => left - right);
  const rank = (fraction: number) =>
    sorted[
      Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)
    ] ?? null;
  return { median: rank(0.5), p90: rank(0.9), max: sorted.at(-1) ?? null };
};

type TimelineEntry =
  | { readonly at: number; readonly kind: "activation"; readonly name: string }
  | { readonly at: number; readonly kind: "compaction" };

interface MutableToolCall {
  toolCallId: string;
  name: string;
  argumentChars: number;
  arguments: unknown;
  at: number;
  firstDeltaMs: number | null;
  lastDeltaMs: number | null;
  executionMs: number | null;
  isError: boolean | null;
  output: unknown;
}

interface MutableStep {
  turnId: string;
  requestStartAt: number;
  startedAt: number;
  completedAt: number | null;
  toolsCommittedAt: number | null;
  firstTextAt: number | null;
  reasoningSummaryMs: number;
  textMs: number;
  openBlocks: Map<string, number>;
  toolCalls: MutableToolCall[];
  usage: Usage;
}

const buildExchange = (
  index: number,
  submission: RunSubmission,
  previous: RunSubmission | undefined,
  events: readonly StreamEvent[],
  chronology: LoggedSubmissionChronology | undefined,
  netBefore: NetSize | null,
): {
  exchange: Omit<PacketExchange, "skillReloads">;
  timeline: TimelineEntry[];
} => {
  const steps: MutableStep[] = [];
  let boundary = submission.acceptedAt;
  let settledAt = submission.settledAt;
  let outcome: string | null = null;
  let userExcerpt = "";
  let firstTextAt: number | null = null;
  const callsById = new Map<string, MutableToolCall>();
  const compactions: { tokensBefore: number | null }[] = [];
  const timeline: TimelineEntry[] = [];

  for (const event of events) {
    const { payload } = event;
    const current = steps.at(-1);
    const blockId = stringField(payload, "blockId") ?? "";
    switch (event.type) {
      case "user_message":
        if (userExcerpt === "") userExcerpt = userExcerptOf(payload);
        break;
      case "agent_start_run":
        if (steps.length === 0) boundary = event.at;
        break;
      case "assistant_message_started":
        steps.push({
          turnId: stringField(payload, "turnId") ?? "",
          // A previous step that committed no tool results runs until this start.
          requestStartAt:
            current === undefined || current.toolsCommittedAt !== null
              ? boundary
              : event.at,
          startedAt: event.at,
          completedAt: null,
          toolsCommittedAt: null,
          firstTextAt: null,
          reasoningSummaryMs: 0,
          textMs: 0,
          openBlocks: new Map(),
          toolCalls: [],
          usage: zeroUsage,
        });
        break;
      case "assistant_reasoning_started":
      case "assistant_text_started":
        current?.openBlocks.set(blockId, event.at);
        if (event.type === "assistant_text_started" && current) {
          current.firstTextAt ??= event.at;
          firstTextAt ??= event.at;
        }
        break;
      case "assistant_reasoning_completed":
      case "assistant_text_completed": {
        const startedAt = current?.openBlocks.get(blockId);
        if (current && startedAt !== undefined) {
          if (event.type === "assistant_text_completed")
            current.textMs += event.at - startedAt;
          else current.reasoningSummaryMs += event.at - startedAt;
        }
        break;
      }
      case "assistant_tool_call": {
        const toolCallId = stringField(payload, "toolCallId") ?? "";
        const call: MutableToolCall = {
          toolCallId,
          name: stringField(payload, "name") ?? "?",
          argumentChars: JSON.stringify(payload.arguments ?? {}).length,
          arguments: payload.arguments,
          at: event.at,
          firstDeltaMs: null,
          lastDeltaMs: null,
          executionMs: null,
          isError: null,
          output: undefined,
        };
        current?.toolCalls.push(call);
        callsById.set(toolCallId, call);
        break;
      }
      case "assistant_message_completed":
        if (current) {
          current.completedAt = event.at;
          current.usage = usageOf(payload);
        }
        break;
      case "tool_outcome": {
        const call = callsById.get(stringField(payload, "toolCallId") ?? "");
        if (call) {
          const durationMs = payload.durationMs;
          call.executionMs = typeof durationMs === "number" ? durationMs : null;
          call.isError = payload.isError === true;
          call.output = payload.output;
        }
        break;
      }
      case "tool_results_committed":
        if (current) current.toolsCommittedAt = event.at;
        boundary = event.at;
        break;
      case "compaction": {
        const { tokensBefore } = payload;
        compactions.push({
          tokensBefore: typeof tokensBefore === "number" ? tokensBefore : null,
        });
        timeline.push({ at: event.at, kind: "compaction" });
        break;
      }
      case "submission_settled":
        settledAt ??= event.at;
        outcome = stringField(payload, "outcome") ?? null;
        break;
    }
  }

  const chronologyTurns = new Map(
    (chronology?.turns ?? []).map((turn) => [turn.turnId, turn]),
  );
  const exchangeEndAt = settledAt ?? events.at(-1)?.at ?? submission.acceptedAt;
  const packetSteps: PacketStep[] = steps.map((step, stepIndex) => {
    const cutOffAt = steps[stepIndex + 1]?.startedAt ?? exchangeEndAt;
    const turn = chronologyTurns.get(step.turnId);
    const deltas = new Map(
      (turn?.toolCalls ?? []).map((call) => [call.toolCallId, call]),
    );
    // Chronology offsets count from the turn's start; packet offsets from the step's request.
    const turnStartOffsetMs =
      turn?.startedAt === undefined
        ? null
        : Date.parse(turn.startedAt) - step.requestStartAt;
    const streamedCalls = step.toolCalls.flatMap((call) => {
      const streamed = deltas.get(call.toolCallId);
      return streamed === undefined ? [] : [streamed];
    });
    const toolCalls: PacketToolCall[] = step.toolCalls.map((call) => {
      const streamed = deltas.get(call.toolCallId);
      return {
        toolCallId: call.toolCallId,
        name: call.name,
        category: toolCategoryOf(call.name),
        argumentChars: streamed?.argumentChars ?? call.argumentChars,
        firstDeltaMs:
          streamed === undefined || turnStartOffsetMs === null
            ? null
            : turnStartOffsetMs + streamed.firstDeltaMs,
        lastDeltaMs:
          streamed === undefined || turnStartOffsetMs === null
            ? null
            : turnStartOffsetMs + streamed.lastDeltaMs,
        executionMs: call.executionMs,
        isError: call.isError,
      };
    });
    const completedAt =
      step.completedAt ?? Math.max(step.requestStartAt, cutOffAt);
    const durationMs = completedAt - step.requestStartAt;
    const cutOffIn =
      step.completedAt === null
        ? ("message" as const)
        : step.toolCalls.length > 0 && step.toolsCommittedAt === null
          ? ("tools" as const)
          : null;
    const firstOutputOffsets = [
      ...(step.firstTextAt === null
        ? []
        : [step.firstTextAt - step.requestStartAt]),
      ...toolCalls.flatMap((call) =>
        call.firstDeltaMs === null ? [] : [call.firstDeltaMs],
      ),
    ];
    return {
      turnId: step.turnId,
      durationMs,
      beforeOutputMs: Math.min(durationMs, ...firstOutputOffsets),
      reasoningSummaryMs: step.reasoningSummaryMs,
      textMs: step.textMs,
      argumentStreamingMs:
        turn === undefined
          ? null
          : streamedCalls.length === 0
            ? 0
            : Math.max(...streamedCalls.map((call) => call.lastDeltaMs)) -
              Math.min(...streamedCalls.map((call) => call.firstDeltaMs)),
      toolPhaseMs:
        cutOffIn === "message" || step.toolCalls.length === 0
          ? 0
          : Math.max(0, (step.toolsCommittedAt ?? cutOffAt) - completedAt),
      cutOffIn,
      toolCalls,
      usage: step.usage,
    };
  });

  const categories = emptyCategories();
  const skillActivations: string[] = [];
  const skillResourceReads: string[] = [];
  const ledger = {
    commits: 0,
    recorded: 0,
    refused: 0,
    recordsAdded: 0,
    argumentChars: 0,
  };
  let netChanges = 0;
  let netAfter = netBefore;
  const longToolCalls: { name: string; executionMs: number }[] = [];
  const argumentCharsById = new Map(
    packetSteps
      .flatMap((step) => step.toolCalls)
      .map((call) => [call.toolCallId, call.argumentChars]),
  );
  for (const step of steps) {
    for (const call of step.toolCalls) {
      const argumentChars =
        argumentCharsById.get(call.toolCallId) ?? call.argumentChars;
      const category = toolCategoryOf(call.name);
      categories[category] = {
        calls: categories[category].calls + 1,
        executionMs: categories[category].executionMs + (call.executionMs ?? 0),
        argumentChars: categories[category].argumentChars + argumentChars,
      };
      if (call.name === brunchTools.activateSkill) {
        const name = stringField(call.arguments, "name") ?? "?";
        skillActivations.push(name);
        timeline.push({ at: call.at, kind: "activation", name });
      }
      if (call.name === brunchTools.readSkillResource) {
        skillResourceReads.push(
          skillResourcePath(stringField(call.arguments, "path") ?? "?"),
        );
      }
      if (call.name === brunchTools.ledgerCommit) {
        ledger.commits += 1;
        ledger.argumentChars += argumentChars;
        if (stringField(call.output, "status") === "recorded") {
          ledger.recorded += 1;
          const ids = isRecord(call.output) ? call.output.ids : undefined;
          ledger.recordsAdded += Array.isArray(ids) ? ids.length : 0;
        } else if (call.isError !== null) {
          ledger.refused += 1;
        }
      }
      if (changedDocument(call.output)) netChanges += 1;
      netAfter = netSizeOf(call.output) ?? netAfter;
      if (call.executionMs !== null && call.executionMs >= longToolCallMs) {
        longToolCalls.push({ name: call.name, executionMs: call.executionMs });
      }
    }
  }

  const sum = (pick: (step: PacketStep) => number) =>
    packetSteps.reduce((total, step) => total + pick(step), 0);
  const modelMs = sum((step) => step.durationMs);
  const toolPhaseMs = sum((step) => step.toolPhaseMs);
  const approvalWaitMs = sum((step) =>
    step.toolCalls.some(
      (call) => call.executionMs !== null && call.executionMs >= longToolCallMs,
    ) ||
    (step.cutOffIn === "tools" &&
      step.toolPhaseMs >= longToolCallMs &&
      step.toolCalls.some((call) => call.executionMs === null))
      ? step.toolPhaseMs
      : 0,
  );
  const wallMs = settledAt === null ? null : settledAt - submission.acceptedAt;
  const exchange = {
    index,
    submissionId: submission.submissionId,
    outcome,
    userExcerpt,
    thinkTimeBeforeMs:
      previous?.settledAt === null || previous === undefined
        ? null
        : submission.acceptedAt - previous.settledAt,
    wallMs,
    untilFirstTextMs:
      firstTextAt === null ? null : firstTextAt - submission.acceptedAt,
    modelMs,
    beforeOutputMs: sum((step) => step.beforeOutputMs),
    argumentStreamingMs: chronology
      ? sum((step) => step.argumentStreamingMs ?? 0)
      : null,
    textMs: sum((step) => step.textMs),
    toolPhaseMs,
    otherMs: wallMs === null ? null : wallMs - modelMs - toolPhaseMs,
    steps: packetSteps,
    categories,
    skillActivations,
    skillResourceReads,
    compactions,
    ledger,
    netChanges,
    netAfter,
    longToolCalls,
    approvalWaitMs,
    activeMs: wallMs === null ? null : wallMs - approvalWaitMs,
    stepShape: packetSteps.map((step) =>
      step.toolCalls.length === 0
        ? "reply"
        : [
            ...(step.textMs > 0 ? ["text"] : []),
            ...toolCategories.filter((category) =>
              step.toolCalls.some((call) => call.category === category),
            ),
          ].join("+"),
    ),
    usage: packetSteps.reduce(
      (total, step) => addUsage(total, step.usage),
      zeroUsage,
    ),
  };
  return { exchange, timeline };
};

/** A run's per-exchange turn-time and tool accounting, from its conversation stream. */
export const buildRunPacket = (input: RunPacketInput): RunPacket => {
  const eventsBySubmission = new Map<string, StreamEvent[]>();
  for (const event of input.events) {
    const list = eventsBySubmission.get(event.submissionId) ?? [];
    list.push(event);
    eventsBySubmission.set(event.submissionId, list);
  }
  const exchanges: PacketExchange[] = [];
  let netBefore: NetSize | null = null;
  // Per skill: whether a compaction has come since its last activation.
  const skillState = new Map<string, { compactedSince: boolean }>();
  input.submissions.forEach((submission, index) => {
    const events = [...(eventsBySubmission.get(submission.submissionId) ?? [])]
      // Stable: events sharing a timestamp keep stream order.
      .sort((left, right) => left.at - right.at);
    const { exchange, timeline } = buildExchange(
      index + 1,
      submission,
      input.submissions[index - 1],
      events,
      input.chronology.get(submission.submissionId),
      netBefore,
    );
    const skillReloads: { name: string; afterCompaction: boolean }[] = [];
    for (const entry of timeline.sort((left, right) => left.at - right.at)) {
      if (entry.kind === "compaction") {
        for (const state of skillState.values()) state.compactedSince = true;
        continue;
      }
      const state = skillState.get(entry.name);
      if (state) {
        skillReloads.push({
          name: entry.name,
          afterCompaction: state.compactedSince,
        });
      }
      skillState.set(entry.name, { compactedSince: false });
    }
    netBefore = exchange.netAfter;
    exchanges.push({ ...exchange, skillReloads });
  });

  const steps = exchanges.flatMap((exchange) => exchange.steps);
  const categories = exchanges.reduce(
    (totals, exchange) => addCategories(totals, exchange.categories),
    emptyCategories(),
  );
  const skillActivations: Record<string, number> = {};
  for (const name of exchanges.flatMap((exchange) => exchange.skillActivations))
    skillActivations[name] = (skillActivations[name] ?? 0) + 1;
  const total = (pick: (exchange: PacketExchange) => number) =>
    exchanges.reduce((sum, exchange) => sum + pick(exchange), 0);
  const settled = exchanges.flatMap((exchange) =>
    exchange.wallMs === null || exchange.activeMs === null
      ? []
      : [{ ...exchange, wallMs: exchange.wallMs, activeMs: exchange.activeMs }],
  );
  const totalSettled = (pick: (exchange: (typeof settled)[number]) => number) =>
    settled.reduce((sum, exchange) => sum + pick(exchange), 0);
  const hasChronology = input.chronology.size > 0;

  return {
    version: 2,
    label: input.label,
    metadata: input.metadata,
    sources: { chronology: hasChronology, skipped: input.skipped },
    summary: {
      exchanges: exchanges.length,
      incomplete: {
        unsettledExchanges: exchanges.length - settled.length,
        cutOffMessages: steps.filter((step) => step.cutOffIn === "message")
          .length,
        cutOffToolPhases: steps.filter((step) => step.cutOffIn === "tools")
          .length,
      },
      wallMs: totalSettled((exchange) => exchange.wallMs),
      approvalWaitMs: totalSettled((exchange) => exchange.approvalWaitMs),
      activeMs: totalSettled((exchange) => exchange.activeMs),
      activePerExchangeMs: distributionOf(
        exchanges.flatMap((exchange) =>
          exchange.activeMs === null ? [] : [exchange.activeMs],
        ),
      ),
      untilFirstTextMs: distributionOf(
        exchanges.flatMap((exchange) =>
          exchange.untilFirstTextMs === null ? [] : [exchange.untilFirstTextMs],
        ),
      ),
      steps: steps.length,
      stepsPerExchange:
        exchanges.length === 0 ? null : steps.length / exchanges.length,
      stepsByToolCount: {
        none: steps.filter((step) => step.toolCalls.length === 0).length,
        one: steps.filter((step) => step.toolCalls.length === 1).length,
        several: steps.filter((step) => step.toolCalls.length > 1).length,
      },
      modelMs: totalSettled((exchange) => exchange.modelMs),
      beforeOutputMs: totalSettled((exchange) => exchange.beforeOutputMs),
      argumentStreamingMs: hasChronology
        ? totalSettled((exchange) => exchange.argumentStreamingMs ?? 0)
        : null,
      textMs: totalSettled((exchange) => exchange.textMs),
      toolPhaseMs: totalSettled((exchange) => exchange.toolPhaseMs),
      categories,
      skillActivations,
      skillReloads: total((exchange) => exchange.skillReloads.length),
      skillReloadsAfterCompaction: total(
        (exchange) =>
          exchange.skillReloads.filter((reload) => reload.afterCompaction)
            .length,
      ),
      compactions: total((exchange) => exchange.compactions.length),
      skillResourceReads: total(
        (exchange) => exchange.skillResourceReads.length,
      ),
      ledgerCommits: total((exchange) => exchange.ledger.commits),
      ledgerRefused: total((exchange) => exchange.ledger.refused),
      ledgerArgumentChars: total((exchange) => exchange.ledger.argumentChars),
      longToolCalls: total((exchange) => exchange.longToolCalls.length),
      usage: exchanges.reduce(
        (sum, exchange) => addUsage(sum, exchange.usage),
        zeroUsage,
      ),
    },
    finalLedger: input.finalLedger,
    finalNet: input.finalNet,
    exchanges,
  };
};
