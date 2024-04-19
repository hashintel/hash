import type { Logger } from "@local/hash-backend-utils/logger";
import { getRequiredEnv } from "@local/hash-isomorphic-utils/environment";
import { Client as TemporalClient, Connection } from "@temporalio/client";

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
