import { randomUUID } from "node:crypto";

import { Logger } from "@local/hash-backend-utils/logger";

export const INSTANCE_ID = randomUUID();

export const NODE_ENV = process.env.NODE_ENV ?? "development";

if (!["development", "production"].includes(NODE_ENV)) {
  throw new Error(`Invalid value "${NODE_ENV}" for envvar "NODE_ENV"`);
}

// Configure the logger
export const logger = new Logger({
  serviceName: "search-loader",
  mode: process.env.NODE_ENV === "development" ? "dev" : "prod",
  level: process.env.NODE_ENV === "development" ? "debug" : "info",
  metadata: { instanceId: INSTANCE_ID },
});
