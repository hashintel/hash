/**
 * The server's one failure-diagnostic sink. Every report names a stage and the
 * runtime IDs Flue already generates; development keeps the original error and
 * stack, production keeps only the error's type/code.
 *
 * Content policy: never log prompts, tool arguments or results, request bodies,
 * principal keys or raw conversation IDs. Callers pass classification and
 * counts about external data, never the data.
 */

import { logger, loggerEnvironment } from "./logger.ts";
import { errorCode } from "./telemetry.ts";

import type { FlueObservation, FlueObservationSubscriber } from "@flue/runtime";
import type { LoggerConfig } from "@local/hash-backend-utils/logger";

export type DiagnosticStage =
  | "flue.tool"
  | "flue.turn"
  | "flue.task"
  | "flue.compaction"
  | "flue.operation"
  | "flue.submission"
  | "flue.recovery"
  | "flue.log"
  | "client-tool-result.parse"
  | "why.explain"
  | "http.admission-body"
  | "provider.accounting"
  | "database.configuration"
  | "database.operation";

/** Correlation and classification only; string values must never be content. */
export type DiagnosticFields = Record<
  string,
  string | number | boolean | undefined
>;

/** What survives into a log line about a thrown value. */
export interface ClassifiedError {
  readonly type: string;
  readonly code?: string;
  readonly name?: string;
  readonly message?: string;
  readonly stack?: string;
}

export interface RuntimeDiagnostics {
  /** Report a failure this server observed or contained at `stage`. */
  readonly report: (
    stage: DiagnosticStage,
    error: unknown,
    fields?: DiagnosticFields,
  ) => void;
  /** Report a condition with no thrown value, e.g. dropped malformed input. */
  readonly note: (stage: DiagnosticStage, fields: DiagnosticFields) => void;
  /** Flue observer that reports failed runtime events. */
  readonly observe: FlueObservationSubscriber;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const stringField = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

/**
 * Reduce any thrown value, or a Flue-serialized error record, to its
 * classification. `verbose` retains message and stack for development.
 */
export const classifyError = (
  error: unknown,
  verbose: boolean,
): ClassifiedError => {
  if (error instanceof Error) {
    const code = errorCode(error);
    return {
      type: code ?? error.constructor.name,
      ...(code === undefined ? {} : { code }),
      name: error.name,
      ...(verbose ? { message: error.message, stack: error.stack } : {}),
    };
  }
  if (isRecord(error)) {
    // Flue's `FlueErrorInfo` and settlement/recovery error records.
    const code = stringField(error.code);
    const name = stringField(error.name);
    const type = stringField(error.type) ?? name ?? code;
    // `message` is the record's own text; `details` only stands in when it is absent.
    const message = stringField(error.message) ?? stringField(error.details);
    const stack = stringField(error.stack);
    if (type !== undefined) {
      return {
        type,
        ...(code === undefined ? {} : { code }),
        ...(name === undefined ? {} : { name }),
        ...(verbose && message !== undefined ? { message } : {}),
        ...(verbose && stack !== undefined ? { stack } : {}),
      };
    }
  }
  return {
    type: typeof error,
    ...(verbose && typeof error === "string" ? { message: error } : {}),
  };
};

/**
 * The text a failed tool returned to the model. Flue's `errorInfo` for an
 * argument-validation failure carries only `type: "_OTHER"`, so in development
 * this is the only place the reason survives. Successful results are never read.
 */
const failedToolText = (result: unknown): string | undefined => {
  if (typeof result === "string") return result;
  if (!isRecord(result) || !Array.isArray(result.content)) return undefined;
  const text = result.content
    .filter(
      (block): block is { type: "text"; text: string } =>
        isRecord(block) &&
        block.type === "text" &&
        typeof block.text === "string",
    )
    .map((block) => block.text)
    .join("\n");
  return text.length > 0 ? text : undefined;
};

const correlation = (observation: FlueObservation): DiagnosticFields => ({
  event: observation.type,
  instanceId: observation.instanceId,
  submissionId: observation.submissionId,
  operationId: observation.operationId,
  turnId: observation.turnId,
  taskId: observation.taskId,
  toolCallId: observation.toolCallId,
  eventIndex: observation.eventIndex,
});

/**
 * Select the failure-carrying runtime events. Every branch reports once; the
 * runtime IDs it carries are how a reader follows one failure across the
 * tool → turn → operation → submission nesting, so no cross-event
 * de-duplication ledger is kept here.
 */
const observedFailure = (
  observation: FlueObservation,
  verbose: boolean,
):
  | { stage: DiagnosticStage; error: unknown; fields: DiagnosticFields }
  | undefined => {
  const fields = correlation(observation);
  switch (observation.type) {
    case "tool":
      return observation.isError
        ? {
            stage: "flue.tool",
            error: observation.errorInfo,
            fields: {
              ...fields,
              toolCallId: observation.toolCallId,
              toolName: observation.toolName,
              origin: observation.origin,
              durationMs: observation.durationMs,
              ...(verbose
                ? { errorText: failedToolText(observation.result) }
                : {}),
            },
          }
        : undefined;
    case "turn":
      return observation.isError
        ? {
            stage: "flue.turn",
            error: observation.response.error ?? observation.errorInfo,
            fields: {
              ...fields,
              turnId: observation.turnId,
              purpose: observation.purpose,
              requestedModel: observation.request.requestedModel,
              finishReason: observation.response.finishReason,
              durationMs: observation.durationMs,
            },
          }
        : undefined;
    case "task":
      return observation.isError
        ? {
            stage: "flue.task",
            error: observation.errorInfo,
            fields: {
              ...fields,
              taskId: observation.taskId,
              agent: observation.agent,
              durationMs: observation.durationMs,
            },
          }
        : undefined;
    case "compaction":
      return observation.isError
        ? {
            stage: "flue.compaction",
            error: observation.error ?? observation.errorInfo,
            fields: {
              ...fields,
              messagesBefore: observation.messagesBefore,
              messagesAfter: observation.messagesAfter,
              durationMs: observation.durationMs,
            },
          }
        : undefined;
    case "operation":
      // A failed `prompt` operation is the submission itself; its
      // `submission_settled` event repeats the same error with the same
      // submission ID, so only nested operations (skill, task, shell,
      // compact) are reported here.
      return observation.isError && observation.operationKind !== "prompt"
        ? {
            stage: "flue.operation",
            error: observation.error ?? observation.errorInfo,
            fields: {
              ...fields,
              operationId: observation.operationId,
              operationKind: observation.operationKind,
              durationMs: observation.durationMs,
            },
          }
        : undefined;
    case "submission_settled":
      // Flue's abort is a distinct terminal outcome, not a failure. A user
      // Stop settles `aborted`; treat it like provider-accounting's abort note.
      return observation.outcome === "completed"
        ? undefined
        : {
            stage: "flue.submission",
            error: observation.error,
            fields: {
              ...fields,
              submissionId: observation.submissionId,
              outcome: observation.outcome,
            },
          };
    case "submission_recovery":
      return {
        stage: "flue.recovery",
        error: observation.error,
        fields: {
          ...fields,
          operation: observation.operation,
          outcome: observation.outcome,
          kind: observation.kind,
          attemptCount: observation.attemptCount,
          maxAttempts: observation.maxAttempts,
        },
      };
    case "log":
      // Agent-emitted error logs are messages the agent author wrote, not content.
      return observation.level === "error"
        ? {
            stage: "flue.log",
            error: undefined,
            fields: { ...fields, message: observation.message },
          }
        : undefined;
    default:
      return undefined;
  }
};

const definedFields = (fields: DiagnosticFields): DiagnosticFields =>
  Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );

/** The two logger methods diagnostics use; the repository `Logger` satisfies it. */
export interface DiagnosticSink {
  error(message: string, meta: Record<string, unknown>): unknown;
  warn(message: string, meta: Record<string, unknown>): unknown;
}

export const createRuntimeDiagnostics = (
  logger: DiagnosticSink,
  environment: LoggerConfig["environment"],
  options?: { readonly local?: DiagnosticSink },
): RuntimeDiagnostics => {
  const verbose = environment !== "production";
  const local = options?.local;
  const exportableError = (classified: ClassifiedError): ClassifiedError =>
    local === undefined
      ? classified
      : {
          type: classified.type,
          ...(classified.code === undefined ? {} : { code: classified.code }),
          ...(classified.name === undefined ? {} : { name: classified.name }),
        };
  const exportableFields = (fields: DiagnosticFields): DiagnosticFields =>
    local === undefined
      ? fields
      : Object.fromEntries(
          Object.entries(fields).filter(([key]) => key !== "errorText"),
        );
  const report: RuntimeDiagnostics["report"] = (stage, error, fields = {}) => {
    const classified = classifyError(error, verbose);
    logger.error(`[brunch] ${stage} failed: ${classified.type}`, {
      stage,
      ...definedFields(exportableFields(fields)),
      error: exportableError(classified),
    });
    if (verbose && local !== undefined) {
      local.error(`[brunch] ${stage} failed: ${classified.type}`, {
        stage,
        ...definedFields(fields),
        error: classified,
      });
    }
  };
  const note: RuntimeDiagnostics["note"] = (stage, fields) => {
    logger.warn(`[brunch] ${stage}`, { stage, ...definedFields(fields) });
  };
  return {
    report,
    note,
    observe: (observation) => {
      const failure = observedFailure(observation, verbose);
      if (!failure) return;
      if (failure.error === undefined && failure.stage === "flue.log") {
        note(failure.stage, failure.fields);
        return;
      }
      if (failure.fields.outcome === "aborted") {
        note(failure.stage, failure.fields);
        return;
      }
      report(failure.stage, failure.error, failure.fields);
    },
  };
};

/** Process-local verbose details; never attached to the shared remote logger. */
const writeLocal = (
  stream: NodeJS.WriteStream,
  message: string,
  meta: Record<string, unknown>,
) => {
  stream.write(`${message} ${JSON.stringify(meta)}\n`);
};

const localDiagnostics: DiagnosticSink = {
  error: (message, meta) => {
    writeLocal(process.stderr, message, meta);
  },
  warn: (message, meta) => {
    writeLocal(process.stderr, message, meta);
  },
};

/** The process-wide sink every server module reports to. */
export const diagnostics = createRuntimeDiagnostics(
  logger,
  loggerEnvironment(),
  { local: localDiagnostics },
);
