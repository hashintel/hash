import fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Context } from "@temporalio/activity";

import { logToConsole } from "../../shared/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = (
  message: string,
  level: "debug" | "error" | "info" | "silly" | "warn",
) => {
  let requestId = "no-requestId-in-context";
  try {
    requestId = Context.current().info.workflowExecution.workflowId;
  } catch {
    // no id in context for some reason
  }

  const consolePrefix = `[Request ${requestId} – ${new Date().toISOString()}]`;

  let logObject: object;
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
      };
    } else {
      logObject = {
        consolePrefix,
        message: parsedLogMessage,
      };
    }
  } catch {
    // not valid JSON
    logObject = {
      consolePrefix,
      message,
    };
  }

  const stringifiedMessage = JSON.stringify(logObject);
  const logFolderPath = path.join(__dirname, "logs");

  if (["test", "development"].includes(process.env.NODE_ENV ?? "")) {
    if (!fs.existsSync(logFolderPath)) {
      fs.mkdirSync(logFolderPath);
    }
    const logFilePath = path.join(logFolderPath, `${requestId}.log`);
    fs.appendFileSync(logFilePath, `${stringifiedMessage}\n`);
  }

  if (process.env.NODE_ENV === "test") {
    // eslint-disable-next-line no-console
    console.log(stringifiedMessage);
  } else {
    logToConsole[level](logObject);
  }
};

export const logger = {
  debug: (message: string) => log(message, "debug"),
  error: (message: string) => log(message, "error"),
  info: (message: string) => log(message, "info"),
  silly: (message: string) => log(message, "silly"),
  warn: (message: string) => log(message, "warn"),
};
