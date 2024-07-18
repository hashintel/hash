import fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Context } from "@temporalio/activity";

import { logToConsole } from "../../shared/logger";

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

  const logMessage = `[Request ${requestId} – ${new Date().toISOString()}] ${message}`;
  const logFolderPath = path.join(__dirname, "logs");

  if (["test", "development"].includes(process.env.NODE_ENV ?? "")) {
    if (!fs.existsSync(logFolderPath)) {
      fs.mkdirSync(logFolderPath);
    }
    const logFilePath = path.join(logFolderPath, `${requestId}.log`);
    fs.appendFileSync(logFilePath, `${logMessage}\n`);
  }

  if (process.env.NODE_ENV === "test") {
    // eslint-disable-next-line no-console
    console.log(logMessage);
  } else {
    logToConsole[level](logMessage);
  }
};

export const logger = {
  debug: (message: string) => log(message, "debug"),
  error: (message: string) => log(message, "error"),
  info: (message: string) => log(message, "info"),
  silly: (message: string) => log(message, "silly"),
  warn: (message: string) => log(message, "warn"),
};
