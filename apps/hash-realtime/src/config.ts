import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { QueueProducer } from "@local/hash-backend-utils/queue/adapter";
import { RedisQueueProducer } from "@local/hash-backend-utils/queue/redis";
import { supportedRealtimeTables } from "@local/hash-backend-utils/realtime";
import { createRedisClient } from "@local/hash-backend-utils/redis";

// The tables to monitor for changes
export const MONITOR_TABLES = supportedRealtimeTables.map(
  (table) => `public.${table}`,
);

// The realtime service will push updates from the Postgres change stream to the following queues.
export const generateQueues = async (
  logger: Logger,
): Promise<readonly { name: string; producer: QueueProducer }[]> => {
  const redisHost = getRequiredEnv("HASH_REDIS_HOST");
  const redisPort = parseInt(getRequiredEnv("HASH_REDIS_PORT"), 10);
  const redisTls = process.env.HASH_REDIS_ENCRYPTED_TRANSIT === "true";
  const redisUrl = `redis${redisTls ? "s" : ""}://${redisHost}:${redisPort}`;

  const redis = await createRedisClient({ url: redisUrl, logger }).connect();

  return [
    {
      name: getRequiredEnv("HASH_SEARCH_QUEUE_NAME"),
      producer: new RedisQueueProducer(redis.duplicate()),
    },
    {
      name: getRequiredEnv("HASH_INTEGRATION_QUEUE_NAME"),
      producer: new RedisQueueProducer(redis),
    },
  ];
};
