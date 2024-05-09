import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";

import { logToConsole } from "../../shared/logger";

export const graphApiClient = createGraphClient(logToConsole, {
  host: getRequiredEnv("HASH_GRAPH_API_HOST"),
  port: parseInt(getRequiredEnv("HASH_GRAPH_API_PORT"), 10),
});
