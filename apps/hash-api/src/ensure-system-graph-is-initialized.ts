import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { createTemporalClient } from "@local/hash-backend-utils/temporal";

import type { ImpureGraphContext } from "./graph/context-types.js";
import { ensureSystemGraphIsInitialized } from "./graph/ensure-system-graph-is-initialized.js";
import { logger } from "./logger.js";

const context: ImpureGraphContext<false, true> = {
  provenance: {
    actorType: "machine",
    origin: {
      type: "migration",
    },
  },
  graphApi: createGraphClient(logger, {
    host: getRequiredEnv("HASH_GRAPH_API_HOST"),
    port: parseInt(getRequiredEnv("HASH_GRAPH_API_PORT"), 10),
  }),
  temporalClient: await createTemporalClient(logger),
};

await ensureSystemGraphIsInitialized({ logger, context });
