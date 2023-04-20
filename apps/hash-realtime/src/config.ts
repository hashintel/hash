import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { Logger } from "@local/hash-backend-utils/logger";
import { supportedRealtimeTables } from "@local/hash-backend-utils/realtime";
import { setupRedisClient } from "@local/hash-backend-utils/redis";
import { RedisStreamProducer } from "@local/hash-backend-utils/stream/redis";

// The tables to monitor for changes
export const MONITOR_TABLES = supportedRealtimeTables.entityTables.map(
  (table) => `public.${table}`,
);

// The realtime service will push all updates from the Postgres changestream to the
// following queues.
export const generateQueues = (logger: Logger) => {
  return {
    entityStream: new RedisStreamProducer(
      logger,
      setupRedisClient(logger, {
        host: getRequiredEnv("HASH_REDIS_HOST"),
        port: parseInt(getRequiredEnv("HASH_REDIS_PORT"), 10),
      }),
      getRequiredEnv("HASH_REALTIME_ENTITY_STREAM_PREFIX"),
    ),
    typeStream: new RedisStreamProducer(
      logger,
      setupRedisClient(logger, {
        host: getRequiredEnv("HASH_REDIS_HOST"),
        port: parseInt(getRequiredEnv("HASH_REDIS_PORT"), 10),
      }),
      getRequiredEnv("HASH_REALTIME_TYPE_STREAM_PREFIX"),
    ),
  } as const;
};
