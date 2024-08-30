import { Logger } from "@local/hash-backend-utils/logger";

export const logger = new Logger({
  environment: process.env.NODE_ENV as "production" | "test" | "development",
  serviceName: "hash-ai-worker-ts",
});
