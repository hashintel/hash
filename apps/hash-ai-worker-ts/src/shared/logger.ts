import fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Logger } from "@local/hash-backend-utils/logger";
import { Context } from "@temporalio/activity";

export const logToConsole = new Logger({
  mode: process.env.NODE_ENV === "production" ? "prod" : "dev",
  serviceName: "hash-ai-worker-ts",
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = (message: string, level: "debug" | "error" | "info" | "warn") => {
  let requestId = "no-requestId-in-context";
  try {
    requestId = Context.current().info.workflowExecution.workflowId;
  } catch {
    // no id in context for some reason
  }

  const logMessage = `[Request ${requestId} – ${new Date().toISOString()}] ${message}`;
  const logFolderPath = path.join(__dirname, "logs");

  if (process.env.NODE_ENV === "development") {
    if (!fs.existsSync(logFolderPath)) {
      fs.mkdirSync(logFolderPath);
    }
    const logFilePath = path.join(logFolderPath, `${requestId}.log`);
    fs.appendFileSync(logFilePath, `${logMessage}\n`);
  }

  logToConsole[level](logMessage);
};

export const logger = {
  debug: (message: string) => log(message, "debug"),
  error: (message: string) => log(message, "error"),
  info: (message: string) => log(message, "info"),
  warn: (message: string) => log(message, "warn"),
};
