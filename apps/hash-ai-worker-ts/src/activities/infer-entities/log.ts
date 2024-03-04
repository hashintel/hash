import fs from "node:fs";
import path, { dirname } from "node:path";

import { Context } from "@temporalio/activity";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const log = (message: string) => {
  const requestId = Context.current().info.workflowExecution.workflowId;

  const logMessage = `[Request ${requestId} – ${new Date().toISOString()}] ${message}`;
  const logFolderPath = path.join(__dirname, "logs");

  if (process.env.NODE_ENV === "development") {
    if (!fs.existsSync(logFolderPath)) {
      fs.mkdirSync(logFolderPath);
    }
    const logFilePath = path.join(logFolderPath, `${requestId}.log`);
    fs.appendFileSync(logFilePath, `${logMessage}\n`);
  }

  // eslint-disable-next-line no-console
  console.debug(logMessage);
};
