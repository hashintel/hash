import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { safeStringify } from "@local/hash-backend-utils/logger";
import { Context } from "@temporalio/activity";

import { logger as baseLogger } from "../../shared/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const log = (
  message: string,
  meta: object | undefined,
  level: "debug" | "error" | "info" | "silly" | "warn",
) => {
  let flowWorkflowId = "no-requestId-in-context";
  try {
    flowWorkflowId = Context.current().info.workflowExecution.workflowId;
  } catch {
    // no id in context for some reason
  }

  const now = new Date().toISOString();

  /**
   * A special prefix which will appear in the console but be stripped out for other destinations (e.g. DataDog)
   */
  const consolePrefix = `[Flow ${flowWorkflowId} – ${now}]`;

  const workflowExecution = Context.current().info.workflowExecution;

  const logObject: {
    consolePrefix: string;
    message: string | object;
    workflowExecution: { workflowId: string; runId: string };
  } & Record<string, unknown> = meta
    ? { consolePrefix, message, workflowExecution, ...meta }
    : { consolePrefix, message, workflowExecution };

  baseLogger[level](logObject);

  /**
   * Save a file per workflow execution for debugging purposes.
   */
  if (["test", "development"].includes(process.env.NODE_ENV ?? "")) {
    const logFolderPath = path.join(__dirname, "flow-run-logs");

    if (!fs.existsSync(logFolderPath)) {
      fs.mkdirSync(logFolderPath);
    }

    const logFilePath = path.join(logFolderPath, `${flowWorkflowId}.log`);

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
  debug: (message: string, meta?: object) => log(message, meta, "debug"),
  error: (message: string, meta?: object) => log(message, meta, "error"),
  info: (message: string, meta?: object) => log(message, meta, "info"),
  silly: (message: string, meta?: object) => log(message, meta, "silly"),
  warn: (message: string, meta?: object) => log(message, meta, "warn"),
};
