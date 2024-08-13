import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Context } from "@temporalio/activity";

import { logger } from "../activity-logger.js";
import type { LlmLog, LlmServerErrorLog } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const writeLogToFile = (log: LlmLog | LlmServerErrorLog) => {
  const logFolderPath = path.join(__dirname, "logs");

  if (!existsSync(logFolderPath)) {
    mkdirSync(logFolderPath);
  }

  const { requestId, taskName } = log;

  const now = new Date();

  const logFilePath = path.join(
    logFolderPath,
    `${now.toISOString()}${taskName ? `-${taskName}` : ""}-${requestId}${"finalized" in log && log.finalized ? "-final" : ""}.json`,
  );

  writeFileSync(logFilePath, JSON.stringify(log, null, 2));
};

export const logLlmServerError = (log: LlmServerErrorLog) => {
  const orderedLog = {
    requestId: log.requestId,
    workflowExecution: Context.current().info.workflowExecution,
    provider: log.provider,
    stepId: log.stepId,
    taskName: log.taskName,
    response: log.response,
    request: log.request,
    secondsTaken: log.secondsTaken,
  };

  logger.error(JSON.stringify(orderedLog));

  if (["development", "test"].includes(process.env.NODE_ENV ?? "")) {
    writeLogToFile(orderedLog);
  }
};

export const logLlmRequest = (log: LlmLog) => {
  const orderedLog = {
    requestId: log.requestId,
    workflowExecution: Context.current().info.workflowExecution,
    finalized: log.finalized,
    provider: log.provider,
    taskName: log.taskName,
    stepId: log.stepId,
    secondsTaken: log.secondsTaken,
    response: log.response,
    request: log.request,
  };

  if (log.response.status === "ok") {
    logger.debug(JSON.stringify(orderedLog));
  } else {
    logger.error(JSON.stringify(orderedLog));
  }

  if (["development", "test"].includes(process.env.NODE_ENV ?? "")) {
    writeLogToFile(orderedLog);
  }
};
