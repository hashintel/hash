import { Logger } from "@local/hash-backend-utils/logger";
import { apiOrigin } from "@local/hash-isomorphic-utils/environment";

import { isDevEnv, isTestEnv } from "./lib/env-config";

export const logger = new Logger({
  environment: isDevEnv ? "development" : isTestEnv ? "test" : "production",
  metadata: {
    hostname: new URL(apiOrigin).hostname,
  },
  serviceName: "api",
});
