import winston from "winston";

import {
  isDevEnv,
  isProdEnv,
  isStatsDEnabled,
  isTestEnv,
  port,
} from "./lib/config";

// Configure the logger
export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.json(),
    winston.format.timestamp()
  ),
  defaultMeta: { service: "api" },
});

if (isDevEnv || isTestEnv) {
  logger.add(
    new winston.transports.Console({
      level: "debug",
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
} else if (isProdEnv) {
  // TODO: add production logging transport here
  // Datadog: https://github.com/winstonjs/winston/blob/master/docs/transports.md#datadog-transport
}
