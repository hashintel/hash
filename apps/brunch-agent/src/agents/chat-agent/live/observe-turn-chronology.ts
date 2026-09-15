/**
 * Per-submission chronology of model requests and argument streaming. One
 * structured log line per settled submission tells a provider stall (no
 * observed progress) from slow generation (deltas still arriving); it does not
 * by itself separate provider failure from hidden reasoning.
 *
 * Content policy: ids, counts and durations only — never argument text.
 */

import type {
  FlueEventContext,
  FlueObservation,
  FlueObservationSubscriber,
} from "@flue/runtime";

export type ToolCallChronology = {
  readonly toolCallId: string;
  readonly toolName: string;
  /** Milliseconds from the turn's start to the first/last argument delta. */
  readonly firstDeltaMs: number;
  readonly lastDeltaMs: number;
  readonly deltaCount: number;
  readonly argumentChars: number;
  readonly maxGapMs: number;
  /** Silence after the last delta until the turn ended or the submission settled. */
  readonly lastDeltaToTerminalMs: number;
};

export type TurnChronology = {
  readonly turnId: string;
  readonly purpose: string;
  /** Milliseconds from `turn_start` to the first model event; null when none arrived. */
  readonly timeToFirstEventMs: number | null;
  /** Milliseconds from `turn_start` to `turn`, or to settlement when no `turn` arrived. */
  readonly durationMs: number;
  readonly terminal: "turn" | "settlement";
  readonly isError: boolean | null;
  readonly inputTokens: number | null;
  readonly cacheReadTokens: number | null;
  readonly outputTokens: number | null;
  readonly toolCalls: readonly ToolCallChronology[];
};

export type SubmissionChronology = {
  readonly submissionId: string;
  readonly outcome: "completed" | "failed" | "aborted";
  readonly turns: readonly TurnChronology[];
};

type ToolCallState = {
  toolCallId: string;
  toolName: string;
  firstDeltaAt: number;
  lastDeltaAt: number;
  deltaCount: number;
  argumentChars: number;
  maxGapMs: number;
};

type TurnState = {
  turnId: string;
  purpose: string;
  startedAt: number;
  firstEventAt: number | null;
  endedAt: number | null;
  isError: boolean | null;
  inputTokens: number | null;
  cacheReadTokens: number | null;
  outputTokens: number | null;
  toolCalls: Map<string, ToolCallState>;
};

const eventTime = (event: FlueObservation): number =>
  Date.parse(event.timestamp);

const submissionOf = (
  event: FlueObservation,
  context: FlueEventContext,
  agentName: string,
): string | undefined =>
  (event.agentName ?? context.agentName) === agentName
    ? event.submissionId
    : undefined;

const finishTurn = (turn: TurnState, terminalAt: number): TurnChronology => {
  const endedAt = turn.endedAt ?? terminalAt;
  return {
    turnId: turn.turnId,
    purpose: turn.purpose,
    timeToFirstEventMs:
      turn.firstEventAt === null ? null : turn.firstEventAt - turn.startedAt,
    durationMs: endedAt - turn.startedAt,
    terminal: turn.endedAt === null ? "settlement" : "turn",
    isError: turn.isError,
    inputTokens: turn.inputTokens,
    cacheReadTokens: turn.cacheReadTokens,
    outputTokens: turn.outputTokens,
    toolCalls: [...turn.toolCalls.values()].map((call) => ({
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      firstDeltaMs: call.firstDeltaAt - turn.startedAt,
      lastDeltaMs: call.lastDeltaAt - turn.startedAt,
      deltaCount: call.deltaCount,
      argumentChars: call.argumentChars,
      maxGapMs: call.maxGapMs,
      lastDeltaToTerminalMs: endedAt - call.lastDeltaAt,
    })),
  };
};

export const createTurnChronologyObserver = (
  agentName: string,
  sink: (chronology: SubmissionChronology) => void,
): {
  readonly dispose: () => void;
  readonly observe: FlueObservationSubscriber;
} => {
  const submissions = new Map<string, Map<string, TurnState>>();

  const turnsOf = (submissionId: string): Map<string, TurnState> => {
    const existing = submissions.get(submissionId);
    if (existing) return existing;
    const created = new Map<string, TurnState>();
    submissions.set(submissionId, created);
    return created;
  };

  const markFirstEvent = (
    submissionId: string,
    turnId: string | undefined,
    at: number,
  ): TurnState | undefined => {
    if (turnId === undefined) return undefined;
    const turn = turnsOf(submissionId).get(turnId);
    if (turn && turn.firstEventAt === null) turn.firstEventAt = at;
    return turn;
  };

  return {
    dispose: () => submissions.clear(),
    observe: (event, context) => {
      const submissionId = submissionOf(event, context, agentName);
      if (submissionId === undefined) return;
      const at = eventTime(event);

      switch (event.type) {
        case "turn_start": {
          const turns = turnsOf(submissionId);
          if (!turns.has(event.turnId)) {
            turns.set(event.turnId, {
              turnId: event.turnId,
              purpose: event.purpose,
              startedAt: at,
              firstEventAt: null,
              endedAt: null,
              isError: null,
              inputTokens: null,
              cacheReadTokens: null,
              outputTokens: null,
              toolCalls: new Map(),
            });
          }
          return;
        }
        case "message_start":
        case "thinking_start":
        case "text_delta":
          markFirstEvent(submissionId, event.turnId, at);
          return;
        case "toolcall_delta": {
          const turn = markFirstEvent(submissionId, event.turnId, at);
          if (!turn) return;
          const chars = event.argumentTextDelta.length;
          const call = turn.toolCalls.get(event.toolCallId);
          if (!call) {
            turn.toolCalls.set(event.toolCallId, {
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              firstDeltaAt: at,
              lastDeltaAt: at,
              deltaCount: 1,
              argumentChars: chars,
              maxGapMs: 0,
            });
            return;
          }
          call.maxGapMs = Math.max(call.maxGapMs, at - call.lastDeltaAt);
          call.lastDeltaAt = at;
          call.deltaCount += 1;
          call.argumentChars += chars;
          return;
        }
        case "turn": {
          const turn = turnsOf(submissionId).get(event.turnId);
          if (!turn) return;
          turn.endedAt = at;
          turn.isError = event.isError;
          const usage = event.response.usage;
          if (usage) {
            turn.inputTokens = usage.input;
            turn.cacheReadTokens = usage.cacheRead;
            turn.outputTokens = usage.output;
          }
          return;
        }
        case "submission_settled": {
          const turns = submissions.get(submissionId);
          submissions.delete(submissionId);
          sink({
            submissionId,
            outcome: event.outcome,
            turns: [...(turns?.values() ?? [])]
              .toSorted((left, right) => left.startedAt - right.startedAt)
              .map((turn) => finishTurn(turn, at)),
          });
          return;
        }
        default:
          return;
      }
    },
  };
};
