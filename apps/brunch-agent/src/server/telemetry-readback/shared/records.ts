import type { ModelCallScope } from "../../model-call-scope.ts";
import type {
  chronologyLogMessage,
  SubmissionChronology,
} from "../../observe-turn-chronology.ts";
import type { ModelStreamIdleTimeout } from "../../provider-admission.ts";
import type { DiagnosticStage } from "../../runtime-diagnostics.ts";

/** Typed against the writers' messages, so renaming either fails to compile here. */
export const chronologyMarker: typeof chronologyLogMessage =
  "[brunch] flue.submission chronology";
export const idleTimeoutMarker = `[brunch] ${"provider.timeout" satisfies DiagnosticStage}`;

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
    : null;

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
export type LoggedSubmissionChronology = Omit<
  SubmissionChronology,
  "outcome" | "turns"
> & {
  /** A log may carry outcomes newer than this reader. */
  readonly outcome: string;
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
  readonly startedAt: string;
  readonly durationMs: number;
  readonly failed: boolean;
  readonly errorType: string | null;
  readonly finishReasons: readonly string[];
  /** HTTP requests beneath the call in start order; more than one means the client retried. */
  readonly httpRequests: readonly {
    readonly statusCode: number | null;
    readonly durationMs: number;
  }[];
};

/** Records read from one source, with what the read could not cover. */
export type ReadResult<Item> = {
  readonly records: readonly Item[];
  /** Lines that could not be read. */
  readonly skipped: number;
  /** The source returned its limit, so older records in the window are missing. */
  readonly truncated: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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

const parsedJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

/** Checks the fields readback keys on; the rest are read as logged. */
const isLoggedTurn = (value: unknown): value is LoggedTurnChronology =>
  isRecord(value) &&
  typeof value.turnId === "string" &&
  typeof value.purpose === "string";

/** A chronology line's fields, or undefined when they are not a chronology. */
export const toChronology = (
  fields: Readonly<Record<string, unknown>>,
  timestamp: string | null,
): LoggedSubmissionChronology | undefined => {
  const { submissionId, outcome } = fields;
  const turns =
    typeof fields.turns === "string" ? parsedJson(fields.turns) : fields.turns;
  if (
    typeof submissionId !== "string" ||
    typeof outcome !== "string" ||
    !Array.isArray(turns) ||
    !turns.every(isLoggedTurn)
  )
    return undefined;
  const loggedAt = stringOrNull(fields.timestamp) ?? timestamp;
  return {
    submissionId,
    outcome,
    turns,
    ...(loggedAt === null ? {} : { timestamp: loggedAt }),
  };
};

export const toIdleTimeout = (
  fields: Readonly<Record<string, unknown>>,
  timestamp: string | null,
): LoggedIdleTimeout =>
  ({
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
  }) satisfies Record<
    keyof ModelStreamIdleTimeout | keyof ModelCallScope | "timestamp",
    unknown
  >;
