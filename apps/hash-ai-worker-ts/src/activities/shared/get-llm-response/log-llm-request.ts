import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { LlmParams, LlmResponse } from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const logLlmRequest = <T extends LlmParams>(params: {
  llmParams: T;
  llmResponse: LlmResponse<T>;
}) => {
  const { llmParams, llmResponse } = params;

  const logFolderPath = path.join(__dirname, "logs");

  if (!existsSync(logFolderPath)) {
    mkdirSync(logFolderPath);
  }

  const now = new Date();

  const logFilePath = path.join(logFolderPath, `${now.toISOString()}.json`);

  writeFileSync(
    logFilePath,
    JSON.stringify({ llmParams, llmResponse }, null, 2),
  );
};
