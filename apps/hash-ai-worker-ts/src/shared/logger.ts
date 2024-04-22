import { Logger } from "@local/hash-backend-utils/logger";

export const logToConsole = new Logger({
  mode: process.env.NODE_ENV === "production" ? "prod" : "dev",
  serviceName: "hash-ai-worker-ts",
});
