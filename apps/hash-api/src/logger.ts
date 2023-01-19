import { Logger } from "@local/hash-backend-utils/logger";

import { isDevEnv, isTestEnv } from "./lib/env-config";

export const logger = new Logger({
  mode: isDevEnv || isTestEnv ? "dev" : "prod",
  serviceName: "api",
});
