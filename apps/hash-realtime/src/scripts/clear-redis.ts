import {
  getRequiredEnv,
  waitOnResource,
} from "@local/hash-backend-utils/environment";
import { Logger } from "@local/hash-backend-utils/logger";
import { createRedisClient } from "@local/hash-backend-utils/redis";

const logger = new Logger({
  serviceName: "clear-redis-queues",
  environment: "development",
});

/**
 * This script clears the Redis queue which the search-loader reads messages from.
 */
const main = async () => {
  const redisHost = getRequiredEnv("HASH_REDIS_HOST");
  const redisPort = parseInt(getRequiredEnv("HASH_REDIS_PORT"), 10);
  const redisTls = process.env.HASH_REDIS_ENCRYPTED_TRANSIT === "true";
  const redisUrl = `redis${redisTls ? "s" : ""}://${redisHost}:${redisPort}`;

  await waitOnResource(`tcp:${redisHost}:${redisPort}`, logger);

  const redis = await createRedisClient({ url: redisUrl, logger }).connect();

  try {
    await redis.flushAll();
    logger.info("Redis data cleared");
  } finally {
    await redis.close();
  }
};

main().catch(logger.error);
