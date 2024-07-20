import { Client as TemporalClient, Connection } from "@temporalio/client";

import { getRequiredEnv } from "./environment.js";
import type { Logger } from "./logger.js";

export { Client as TemporalClient } from "@temporalio/client";

export const createTemporalClient = async (_logger?: Logger) => {
  const temporalServerHost = getRequiredEnv("HASH_TEMPORAL_SERVER_HOST");

  const host = new URL(temporalServerHost).hostname;

  const port = parseInt(process.env.HASH_TEMPORAL_SERVER_PORT || "7233", 10);
  const namespace = "HASH";

  const connection = await Connection.connect({
    address: `${host}:${port}`,
  });

  return new TemporalClient({ connection, namespace });
};
