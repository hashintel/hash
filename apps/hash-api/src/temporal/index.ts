import type { Logger } from "@local/hash-backend-utils/logger";
import { Client as TemporalClient, Connection } from "@temporalio/client";

export { Client as TemporalClient } from "@temporalio/client";

export const createTemporalClient = async (_logger?: Logger) => {
  if (!process.env.HASH_TEMPORAL_SERVER_HOST) {
    return undefined;
  }

  const host = process.env.HASH_TEMPORAL_SERVER_HOST;
  const port = parseInt(process.env.HASH_TEMPORAL_SERVER_PORT || "7233", 10);
  const namespace = "HASH";

  const connection = await Connection.connect({
    address: `${host}:${port}`,
  });

  return new TemporalClient({ connection, namespace });
};
