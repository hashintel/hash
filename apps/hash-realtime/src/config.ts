import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { QueueProducer } from "@local/hash-backend-utils/queue/adapter";
import { RedisQueueProducer } from "@local/hash-backend-utils/queue/redis";
import { supportedRealtimeTables } from "@local/hash-backend-utils/realtime";
import { AsyncRedisClient } from "@local/hash-backend-utils/redis";

// The tables to monitor for changes
export const MONITOR_TABLES = supportedRealtimeTables.map(
  (table) => `public.${table}`,
);

// The realtime service will push updates from the Postgres change stream to the following queues.
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
          tls: process.env.HASH_REDIS_ENCRYPTED_TRANSIT === "true",
        }),
      ),
    },
    {
      name: getRequiredEnv("HASH_INTEGRATION_QUEUE_NAME"),
      producer: new RedisQueueProducer(
        new AsyncRedisClient(logger, {
          host: getRequiredEnv("HASH_REDIS_HOST"),
          port: parseInt(getRequiredEnv("HASH_REDIS_PORT"), 10),
          tls: process.env.HASH_REDIS_ENCRYPTED_TRANSIT === "true",
        }),
      ),
    },
  ];
};
