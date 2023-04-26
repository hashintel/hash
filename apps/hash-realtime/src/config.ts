import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { Logger } from "@local/hash-backend-utils/logger";
import {
  PgEntity,
  PgEntityType,
  PgPropertyType,
} from "@local/hash-backend-utils/pg-tables";
import { supportedRealtimeTables } from "@local/hash-backend-utils/realtime";
import { RedisConfig, setupRedisClient } from "@local/hash-backend-utils/redis";
import { RedisStreamProducer } from "@local/hash-backend-utils/stream/redis";

// The tables to monitor for changes
export const MONITOR_TABLES = supportedRealtimeTables.map(
  (table) => `public.${table}`,
);

const redisConfig: RedisConfig = {
  host: process.env.HASH_REDIS_HOST ?? "localhost",
  port: parseInt(process.env.HASH_REDIS_PORT ?? "6379", 10),
};

// The realtime service will push all updates from the Postgres changestream to the
// following queues.
export const generateQueues = (logger: Logger) => {
  return {
    entityStream: new RedisStreamProducer<PgEntity>(
      logger,
      setupRedisClient(logger, redisConfig),
      getRequiredEnv("HASH_REALTIME_ENTITY_STREAM_NAME"),
    ),
    entityTypeStream: new RedisStreamProducer<PgEntityType>(
      logger,
      setupRedisClient(logger, redisConfig),
      getRequiredEnv("HASH_REALTIME_ENTITY_TYPE_STREAM_NAME"),
    ),
    propertyTypeStream: new RedisStreamProducer<PgPropertyType>(
      logger,
      setupRedisClient(logger, redisConfig),
      getRequiredEnv("HASH_REALTIME_PROPERTY_TYPE_STREAM_NAME"),
    ),
  } as const;
};
