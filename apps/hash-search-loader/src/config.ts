import { randomUUID } from "node:crypto";

import type { LogLevel } from "@local/hash-backend-utils/logger";
import { LOG_LEVELS, Logger } from "@local/hash-backend-utils/logger";

export const INSTANCE_ID = randomUUID();

// TODO: Switch to https://www.npmjs.com/package/envalid

export const NODE_ENV = process.env.NODE_ENV ?? "development";
export const LOG_LEVEL = process.env.LOG_LEVEL;

if (LOG_LEVEL && !LOG_LEVELS.includes(LOG_LEVEL as LogLevel)) {
  throw new Error(`Invalid value "${LOG_LEVEL}" for envvar "LOG_LEVEL"`);
}
if (!["development", "production", "test"].includes(NODE_ENV)) {
  throw new Error(`Invalid value "${NODE_ENV}" for envvar "NODE_ENV"`);
}

// Configure the logger
export const logger = new Logger({
  serviceName: "search-loader",
  environment: NODE_ENV as "development" | "production" | "test",
  metadata: { instanceId: INSTANCE_ID },
});
