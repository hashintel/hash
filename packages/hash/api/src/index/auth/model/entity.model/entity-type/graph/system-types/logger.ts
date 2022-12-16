import { Logger } from "@hashintel/hash-backend-utils/logger";

import { isDevEnv, isTestEnv } from "./logger/env-config";

export const logger = new Logger({
  mode: isDevEnv || isTestEnv ? "dev" : "prod",
  serviceName: "api",
});
