import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { QueueProducer } from "@hashintel/hash-backend-utils/queue/adapter";
import { RedisQueueProducer } from "@hashintel/hash-backend-utils/queue/redis";
import { supportedRealtimeTables } from "@hashintel/hash-backend-utils/realtime";
import { AsyncRedisClient } from "@hashintel/hash-backend-utils/redis";

// The tables to monitor for changes
export const MONITOR_TABLES = supportedRealtimeTables.map(
  (table) => `public.${table}`,
);

// The realtime service will push all updates from the Postgres changestream to the
// following queues.
export const generateQueues = (
  logger: Logger,
): { name: string; producer: QueueProducer }[] => {
  return [
    {
      name: getRequiredEnv("HASH_SEARCH_QUEUE_NAME"),
      producer: new RedisQueueProducer(
        new AsyncRedisClient(logger, {
          host: getRequiredEnv("HASH_REDIS_HOST"),
          port: parseInt(getRequiredEnv("HASH_REDIS_PORT"), 10),
        }),
      ),
    },
    {
      name: getRequiredEnv("HASH_COLLAB_QUEUE_NAME"),
      producer: new RedisQueueProducer(
        new AsyncRedisClient(logger, {
          host: getRequiredEnv("HASH_REDIS_HOST"),
          port: parseInt(getRequiredEnv("HASH_REDIS_PORT"), 10),
        }),
      ),
    },
  ];
};
