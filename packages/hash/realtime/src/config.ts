import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { RedisQueueProducer } from "@hashintel/hash-backend-utils/queue/redis";
import { QueueProducer } from "@hashintel/hash-backend-utils/queue/adapter";
import { AsyncRedisClient } from "@hashintel/hash-backend-utils/redis";

// The tables to monitor for changes
export const MONITOR_TABLES = ["public.entity_versions"];

// The realtime service will push all updates from the Postgres changestream to the
// following queues.
export const QUEUES: { name: string; producer: QueueProducer }[] = [
  {
    name: getRequiredEnv("HASH_SEARCH_QUEUE_NAME"),
    producer: new RedisQueueProducer(
      new AsyncRedisClient({
        host: getRequiredEnv("HASH_REDIS_HOST"),
        port: parseInt(getRequiredEnv("HASH_REDIS_PORT"), 10),
      }),
    ),
  },
  {
    name: getRequiredEnv("HASH_COLLAB_QUEUE_NAME"),
    producer: new RedisQueueProducer(
      new AsyncRedisClient({
        host: getRequiredEnv("HASH_REDIS_HOST"),
        port: parseInt(getRequiredEnv("HASH_REDIS_PORT"), 10),
      }),
    ),
  },
];
