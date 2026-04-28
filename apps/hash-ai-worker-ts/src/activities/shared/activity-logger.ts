import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

      /**
       * Keep any detailed fields out of the log file.
       * We create a file per LLM request, so we can inspect the detailed fields there,
       * and including them in the main log file also makes it harder to inspect and very large.
       *
       * The requestId will be included in the main log file, so we can identify the relevant request file.
       */
      const filtered = JSON.stringify(
        restMeta,
        (key, value) =>
          detailedFields?.includes(key) ? undefined : (value as unknown),
        2,
      );

      /**
       * We don't need the full console prefix because it includes the flow id, which is already in the file name.
       */
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
