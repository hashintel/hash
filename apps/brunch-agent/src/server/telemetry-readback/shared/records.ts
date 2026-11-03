import type { SubmissionChronology } from "../../observe-turn-chronology.ts";

type TurnChronology = SubmissionChronology["turns"][number];

/** Fields absent from logs written before turns carried them. */
type LaterTurnFields =
  | "startedAt"
  | "provider"
  | "requestedModel"
  | "responseModel"
  | "retryOf"
  | "error";

export type LoggedTurnChronology = Omit<TurnChronology, LaterTurnFields> &
  Partial<Pick<TurnChronology, LaterTurnFields>>;

/** `provider/model` as requested; null when the turn predates both. */
export const requestedModelOf = (turn: LoggedTurnChronology): string | null =>
  turn.provider && turn.requestedModel
    ? `${turn.provider}/${turn.requestedModel}`
    : (turn.requestedModel ?? null);

/** The failure's type, and its code where that differs; null when the turn did not fail. */
export const turnErrorOf = ({
  error,
  isError,
}: LoggedTurnChronology): string | null => {
  if (!error) return isError ? "failed" : null;
  return error.code !== undefined && error.code !== error.type
    ? `${error.type} ${error.code}`
    : error.type;
};

/** A chronology as read back from a log, which may predate later turn fields. */
export type LoggedSubmissionChronology = Omit<SubmissionChronology, "turns"> & {
  readonly turns: readonly LoggedTurnChronology[];
  /** When the line was logged: the logger's timestamp, or the log store's. */
  readonly timestamp?: string;
};

/** A `provider.timeout` line; any field a log store dropped is null. */
export type LoggedIdleTimeout = {
  readonly timestamp: string | null;
  readonly submissionId: string | null;
  readonly turnId: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly phase: string | null;
  readonly idleMs: number | null;
  readonly lastEventType: string | null;
  readonly acknowledged: boolean | null;
  readonly retryClaimed: boolean | null;
};

/** One model call's span, reduced to metadata. */
export type ModelCallSpan = {
  readonly traceId: string;
  readonly turnId: string | null;
  readonly provider: string | null;
  readonly requestedModel: string | null;
  readonly responseModel: string | null;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly failed: boolean;
  readonly errorType: string | null;
  readonly finishReasons: readonly string[];
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  /** HTTP requests beneath the call in start order; more than one means the client retried. */
  readonly httpRequests: readonly {
    readonly statusCode: number | null;
    readonly durationMs: number;
  }[];
};

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/** Log stores keep structured fields as strings; JSON lines keep their types. */
const numberOrNull = (value: unknown): number | null => {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
};

const booleanOrNull = (value: unknown): boolean | null =>
  value === true || value === "true"
    ? true
    : value === false || value === "false"
      ? false
      : null;

export const toIdleTimeout = (
  fields: Readonly<Record<string, unknown>>,
  timestamp: string | null,
): LoggedIdleTimeout => ({
  timestamp: stringOrNull(fields.timestamp) ?? timestamp,
  submissionId: stringOrNull(fields.submissionId),
  turnId: stringOrNull(fields.turnId),
  provider: stringOrNull(fields.provider),
  model: stringOrNull(fields.model),
  phase: stringOrNull(fields.phase),
  idleMs: numberOrNull(fields.idleMs),
  lastEventType: stringOrNull(fields.lastEventType),
  acknowledged: booleanOrNull(fields.acknowledged),
  retryClaimed: booleanOrNull(fields.retryClaimed),
});
