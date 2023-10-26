import { entityEditionRecordFromRealtimeMessage } from "@local/hash-backend-utils/pg-tables";
import { RedisQueueExclusiveConsumer } from "@local/hash-backend-utils/queue/redis";
import { AsyncRedisClient } from "@local/hash-backend-utils/redis";
import { Wal2JsonMsg } from "@local/hash-backend-utils/wal2json";
import type { GraphApi } from "@local/hash-graph-client";
import {
  fullDecisionTimeAxis,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { Entity, EntityRootType } from "@local/hash-subgraph";
import {
  getRoots,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";

import { systemUserAccountId } from "../graph/system-user";
import { logger } from "../logger";
import { getRequiredEnv } from "../util";
import {
  processEntityChange as processLinearEntityChange,
  supportedTypeIds as linearEntityTypeIds,
} from "./linear/sync-back";

const sendEntityToRelevantProcessor = (
  entity: Entity,
  graphApiClient: GraphApi,
) => {
  if (linearEntityTypeIds.includes(entity.metadata.entityTypeId)) {
    void processLinearEntityChange(entity, graphApiClient);
  }
};

export const createIntegrationSyncBackWatcher = async (
  graphApiClient: GraphApi,
) => {
  const queueName = getRequiredEnv("HASH_INTEGRATION_QUEUE_NAME");

  const redisClient = new AsyncRedisClient(logger, {
    host: getRequiredEnv("HASH_REDIS_HOST"),
    port: parseInt(getRequiredEnv("HASH_REDIS_PORT"), 10),
  });

  const queue = new RedisQueueExclusiveConsumer(redisClient);

  const processQueueMessage = () => {
    queue
      .pop(queueName, null, async (item: string) => {
        const message = JSON.parse(item) as Wal2JsonMsg;

        const entityEdition = entityEditionRecordFromRealtimeMessage(message);

        const entity = (
          await graphApiClient
            .getEntitiesByQuery(systemUserAccountId, {
              filter: {
                equal: [
                  { path: ["editionId"] },
                  { parameter: entityEdition.entityEditionId },
                ],
              },
              graphResolveDepths: zeroedGraphResolveDepths,
              temporalAxes: fullDecisionTimeAxis,
            })
            .then(({ data }) => {
              const subgraph =
                mapGraphApiSubgraphToSubgraph<EntityRootType>(data);
              return getRoots(subgraph);
            })
        )[0];

        if (!entity) {
          throw new Error(
            `Entity with editionId ${entityEdition.entityEditionId} not found in database.`,
          );
        }

        sendEntityToRelevantProcessor(entity, graphApiClient);

        return true;
      })
      .catch((err) => {
        // eslint-disable-next-line no-console -- caught because this function loses ownership of the queue occasionally in dev
        console.error(`Could not take message from queue: ${err.message}`);
      });
  };

  let interval: NodeJS.Timer;

  return {
    stop: async () => {
      clearInterval(interval);
      await queue.release();
      await redisClient.close();
    },

    start: async () => {
      while (!(await queue.acquire(queueName, 2_000))) {
        logger.silly(
          "Integration queue is owned by another consumer. Attempting to acquire ownership again ...",
        );
      }

      interval = setInterval(() => {
        processQueueMessage();
      }, 1_000);
    },
  };
};
