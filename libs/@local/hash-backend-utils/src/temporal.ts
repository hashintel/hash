import { Client as TemporalClient, Connection } from "@temporalio/client";

import { getRequiredEnv } from "./environment.js";
import type { Logger } from "./logger.js";

export { Client as TemporalClient } from "@temporalio/client";

export const temporalNamespace = "HASH";

export const createTemporalClient = async (_logger?: Logger) => {
  const temporalServerHost = "http://localhost";

  const host = new URL(temporalServerHost).hostname;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- we don't want an empty string
  const port = parseInt(process.env.HASH_TEMPORAL_SERVER_PORT || "7233", 10);

  const connection = await Connection.connect({
    address: `${host}:${port}`,
  });

  return new TemporalClient({ connection, namespace: temporalNamespace });
};
