import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { getMachineActorId } from "@local/hash-backend-utils/machine-actors";
import { entityEditionRecordFromRealtimeMessage } from "@local/hash-backend-utils/pg-tables";
import { RedisQueueExclusiveConsumer } from "@local/hash-backend-utils/queue/redis";
import { AsyncRedisClient } from "@local/hash-backend-utils/redis";
import type { Wal2JsonMsg } from "@local/hash-backend-utils/wal2json";
import type { GraphApi } from "@local/hash-graph-client";
import type { Entity } from "@local/hash-graph-sdk/entity";
import { fullDecisionTimeAxis } from "@local/hash-isomorphic-utils/graph-queries";
import { mapGraphApiEntityToEntity } from "@local/hash-isomorphic-utils/subgraph-mapping";

import { systemAccountId } from "../graph/system-account";
import { logger } from "../logger";
import {
  processEntityChange as processLinearEntityChange,
  supportedLinearTypeIds,
} from "./linear/sync-back";

const sendEntityToRelevantProcessor = (
  entity: Entity,
  graphApiClient: GraphApi,
) => {
  if (supportedLinearTypeIds.includes(entity.metadata.entityTypeId)) {
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
    tls: process.env.HASH_REDIS_ENCRYPTED_TRANSIT === "true",
  });

  const queue = new RedisQueueExclusiveConsumer(redisClient);

  const processQueueMessage = () => {
    queue
      .pop(queueName, null, async (item: string) => {
        const message = JSON.parse(item) as Wal2JsonMsg;

        const entityEdition = entityEditionRecordFromRealtimeMessage(message);

        const linearBotAccountId = await getMachineActorId(
          { graphApi: graphApiClient },
          { actorId: systemAccountId },
          { identifier: "linear" },
        );

        const entity = (
          await graphApiClient
            .getEntities(linearBotAccountId, {
              filter: {
                equal: [
                  { path: ["editionId"] },
                  { parameter: entityEdition.entityEditionId },
                ],
              },
              temporalAxes: fullDecisionTimeAxis,
              includeDrafts: false,
            })
            .then(({ data: response }) =>
              response.entities.map((graphEntity) =>
                mapGraphApiEntityToEntity(graphEntity, null, true),
              ),
            )
        )[0];

        if (!entity) {
          /**
           * The linear bot may not have access to the entity, which means
           * it it's probably not an entity that should be processed.
           *
           * @todo we probably want to avoid fetching the entity in the sync
           * back watcher entirely, as we don't want to have a single actor
           * that can read all entities in the graph. One way of avoiding this
           * would be passing the `entityTypeId` of the modified entity so that
           * the correct integration processor can be called based on the entity's
           * type.
           *
           * @see https://linear.app/hash/issue/H-756
           */
          return;
        }

        sendEntityToRelevantProcessor(entity, graphApiClient);

        return true;
      })
      .catch((err) => {
        // eslint-disable-next-line no-console -- caught because this function loses ownership of the queue occasionally in dev
        console.error(`Could not take message from queue: ${err.message}`);
      });
  };

  let interval: NodeJS.Timeout;

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
