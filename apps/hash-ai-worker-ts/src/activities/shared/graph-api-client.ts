import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";

import { logger } from "../../shared/logger.js";

export const graphApiClient = createGraphClient(logger, {
  host: getRequiredEnv("HASH_GRAPH_HTTP_HOST"),
  port: parseInt(getRequiredEnv("HASH_GRAPH_HTTP_PORT"), 10),
});
