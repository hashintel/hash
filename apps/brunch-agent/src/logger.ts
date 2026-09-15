/**
 * The repository-standard structured logger for this server. One instance;
 * child loggers carry per-subsystem metadata.
 */

import { Logger, type LoggerConfig } from "@local/hash-backend-utils/logger";

export type LoggerEnvironment = LoggerConfig["environment"];

export const loggerEnvironment = (
  nodeEnv: string | undefined = process.env.NODE_ENV,
): LoggerEnvironment =>
  nodeEnv === "production" || nodeEnv === "test" ? nodeEnv : "development";

export const createBrunchLogger = (
  environment: LoggerEnvironment = loggerEnvironment(),
): Logger => new Logger({ environment, serviceName: "brunch-agent" });

export const logger = createBrunchLogger();
