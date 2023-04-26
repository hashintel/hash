import {
  getRequiredEnv,
  waitOnResource,
} from "@local/hash-backend-utils/environment";
import { Logger } from "@local/hash-backend-utils/logger";
import { setupRedisClient } from "@local/hash-backend-utils/redis";

const logger = new Logger({
  serviceName: "clear-redis-queues",
  mode: "dev",
});

/**
 * This script clears the Redis queue which the search-loader reads messages from.
 */
const main = async () => {
  const host = getRequiredEnv("HASH_REDIS_HOST");
  const port = parseInt(getRequiredEnv("HASH_REDIS_PORT"), 10);

  await waitOnResource(`tcp:${host}:${port}`, logger);

  const redis = setupRedisClient(logger, {
    host,
    port,
  });
  try {
    await redis.flushall();
    logger.info("Redis data cleared");
  } finally {
    await redis.quit();
  }
};

main().catch(logger.error);
