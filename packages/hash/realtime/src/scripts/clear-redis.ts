/**
 * This script clears the Redis queue which the search-loader reads messages from.
 */
import { AsyncRedisClient } from "@hashintel/hash-backend-utils/redis";
import { Logger } from "@hashintel/hash-backend-utils/logger";

const logger = new Logger({
  level: "debug",
  serviceName: "clear-redis-queues",
  mode: "dev",
});

const main = async () => {
  const redis = new AsyncRedisClient({
    host: process.env.HASH_REDIS_HOST || "localhost",
    port: parseInt(process.env.HASH_REDIS_PORT || "6379", 10),
  });
  try {
    await redis.flushall();
    logger.info("Redis data cleared");
  } finally {
    await redis.close();
  }
};

main().catch(logger.error);
