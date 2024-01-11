import fs from "node:fs";
import path from "node:path";

import { Context } from "@temporalio/activity";

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
