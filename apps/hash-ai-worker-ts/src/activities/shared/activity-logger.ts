import fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Context } from "@temporalio/activity";

import { logger as baseLogger } from "../../shared/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = (
  message: string,
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

  let logObject: {
    consolePrefix: string;
    message: string | object;
    workflowExecution: {
      workflowId: string;
      runId: string;
    };
  };

  const workflowExecution = Context.current().info.workflowExecution;

  try {
    const parsedLogMessage = JSON.parse(message) as unknown;

    if (
      typeof parsedLogMessage !== "object" ||
      Array.isArray(parsedLogMessage) ||
      parsedLogMessage === null
    ) {
      // not a JSON object
      logObject = {
        consolePrefix,
        message,
        workflowExecution,
      };
    } else {
      logObject = {
        consolePrefix,
        message: parsedLogMessage,
        workflowExecution,
      };
    }
  } catch {
    // not valid JSON
    logObject = {
      consolePrefix,
      message,
      workflowExecution,
    };
  }

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

    let stringifiedMessage = logObject.message;

    if (typeof stringifiedMessage === "object") {
      const { detailedFields, ...restMessage } = logObject.message as {
        detailedFields?: string[];
        [key: string]: unknown;
      };

      /**
       * We don't need the full console prefix because it includes the flow id, which is already in the file name.
       */
      stringifiedMessage = `[${now}]: ${JSON.stringify(
        restMessage,
        (key, value) => {
          /**
           * Keep any detailed fields out of the log file.
           * We create a file per LLM request, so we can inspect the detailed fields there,
           * and including them in the main log file also makes it harder to inspect and very large.
           *
           * The requestId will be included in the main log file, so we can identify the relevant request file.
           */
          if (detailedFields?.includes(key)) {
            return undefined;
          }

          return value as unknown;
        },
        2,
      )}`;
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
  debug: (message: string) => log(message, "debug"),
  error: (message: string) => log(message, "error"),
  info: (message: string) => log(message, "info"),
  silly: (message: string) => log(message, "silly"),
  warn: (message: string) => log(message, "warn"),
};
