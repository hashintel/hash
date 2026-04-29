import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { safeStringify } from "@local/hash-backend-utils/logger";
import { Context } from "@temporalio/activity";

import { logger as baseLogger } from "../../shared/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Keys this helper owns on the resulting log object. Banning them in
 * the caller's `meta` shape is the only way to prevent silent collisions
 * — at runtime, either spread order discards data on overlap.
 */
type ReservedLogKeys = "message" | "consolePrefix" | "workflowExecution";

type LogMeta = { [K in ReservedLogKeys]?: never } & Record<string, unknown>;

const log = (
  message: string,
  meta: LogMeta | undefined,
  level: "debug" | "error" | "info" | "silly" | "warn",
) => {
  // `Context.current()` throws when no Temporal activity context is
  // active (e.g. when the logger is reached from a unit test or a
  // non-activity bootstrap path). Falling back to placeholders keeps
  // the logger working in those cases — particularly important
  // because most callers reach the logger from `catch` blocks where
  // a logger crash would swallow the original error.
  let workflowExecution: { workflowId: string; runId: string } = {
    workflowId: "no-context",
    runId: "no-context",
  };
  try {
    workflowExecution = Context.current().info.workflowExecution;
  } catch {
    // no Temporal context — placeholders above are used
  }

  const now = new Date().toISOString();

  /**
   * A special prefix which will appear in the console but be stripped out for other destinations (e.g. DataDog)
   */
  const consolePrefix = `[Flow ${workflowExecution.workflowId} – ${now}]`;

  // Spread `meta` FIRST so the helper-owned fields (`message`,
  // `consolePrefix`, `workflowExecution`) always win — otherwise a
  // caller passing meta with a `message` key (e.g. an HTTP response
  // body, an LLM error object) would silently overwrite the log
  // description.
  const logObject: {
    consolePrefix: string;
    message: string | object;
    workflowExecution: { workflowId: string; runId: string };
  } & Record<string, unknown> = {
    ...meta,
    consolePrefix,
    message,
    workflowExecution,
  };

  baseLogger[level](logObject);

  /**
   * Save a file per workflow execution for debugging purposes.
   */
  if (["test", "development"].includes(process.env.NODE_ENV ?? "")) {
    const logFolderPath = path.join(__dirname, "flow-run-logs");

    if (!fs.existsSync(logFolderPath)) {
      fs.mkdirSync(logFolderPath);
    }

    const logFilePath = path.join(
      logFolderPath,
      `${workflowExecution.workflowId}.log`,
    );

    let stringifiedMessage: string;

    if (meta) {
      const { detailedFields, ...restMeta } = meta as {
        detailedFields?: string[];
        [key: string]: unknown;
      };

      // Detailed fields go into per-request log files; keep them out of
      // the flow-level log.
      const filtered = safeStringify(restMeta, {
        space: 2,
        replacer: (key, value) =>
          detailedFields?.includes(key) ? undefined : value,
      });

      // File name already encodes the flow id, so no prefix needed here.
      stringifiedMessage = `[${now}] ${message}: ${filtered}`;
    } else {
      stringifiedMessage = `[${now}] ${message}`;
    }

    fs.appendFileSync(logFilePath, `${stringifiedMessage}\n`);
  }
};

/**
 * A dedicated logger for flow runs which:
 * 1. Logs to the console with a prefix indicating the workflow ID.
 * 2. Writes a file per flow run containing its logs, in development and test environments.
 */
export const logger = {
  debug: (message: string, meta?: LogMeta) => log(message, meta, "debug"),
  error: (message: string, meta?: LogMeta) => log(message, meta, "error"),
  info: (message: string, meta?: LogMeta) => log(message, meta, "info"),
  silly: (message: string, meta?: LogMeta) => log(message, meta, "silly"),
  warn: (message: string, meta?: LogMeta) => log(message, meta, "warn"),
};
