import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { LlmParams, LlmResponse } from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const logLlmRequest = <T extends LlmParams>(params: {
  customMetadata: {
    stepId?: string;
    taskName?: string;
  } | null;
  llmParams: T;
  llmResponse: LlmResponse<T>;
}) => {
  const { llmParams, llmResponse } = params;

  const logFolderPath = path.join(__dirname, "logs");

  if (!existsSync(logFolderPath)) {
    mkdirSync(logFolderPath);
  }

  const { customMetadata } = params;
  const { taskName, stepId } = customMetadata ?? {};

  const now = new Date();

  const logFilePath = path.join(
    logFolderPath,
    `${now.toISOString()}${taskName ? `-${taskName}` : ""}.json`,
  );

  writeFileSync(
    logFilePath,
    JSON.stringify({ taskName, stepId, llmParams, llmResponse }, null, 2),
  );
};
