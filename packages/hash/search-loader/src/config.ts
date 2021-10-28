import { randomUUID } from "crypto";
import {
  Logger,
  LogLevel,
  LOG_LEVELS,
} from "@hashintel/hash-backend-utils/logger";
import { getRequiredEnv } from "@hashintel/hash-backend-utils/env";

export const INSTANCE_ID = randomUUID();

export const NODE_ENV = getRequiredEnv("NODE_ENV");
export const LOG_LEVEL = process.env.LOG_LEVEL;

if (LOG_LEVEL && !LOG_LEVELS.includes(LOG_LEVEL as LogLevel)) {
  throw new Error(`Invalid value "${LOG_LEVEL}" for envvar "LOG_LEVEL"`);
}
if (!["development", "production"].includes(NODE_ENV)) {
  throw new Error(`Invalid value "${NODE_ENV}" for envvar "NODE_ENV"`);
}

// Configure the logger
export const logger = new Logger({
  serviceName: "search-loader",
  mode: NODE_ENV === "development" ? "dev" : "prod",
  level: LOG_LEVEL || NODE_ENV === "development" ? "debug" : "info",
  metadata: { instanceId: INSTANCE_ID },
});
