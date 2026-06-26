import { isProdEnv, isStagingEnv } from "../lib/env-config";

import type { TelemetryEnvironment } from "@local/hash-isomorphic-utils/telemetry/types";

export const telemetryEnvironment: TelemetryEnvironment = isProdEnv
  ? "production"
  : isStagingEnv
    ? "staging"
    : "development";
