import "@hashintel/hash-backend-utils/load-dotenv-files";

import { AsyncRedisClient } from "@hashintel/hash-backend-utils/redis";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { waitOnResource } from "@hashintel/hash-backend-utils/environment";

const logger = new Logger({
  level: "debug",
  serviceName: "clear-redis-queues",
  mode: "dev",
});

/**
 * This script clears the Redis queue which the search-loader reads messages from.
 */
const main = async () => {
  const host = process.env.HASH_REDIS_HOST || "localhost";
  const port = parseInt(process.env.HASH_REDIS_PORT || "6379", 10);

  await waitOnResource(`tcp:${host}:${port}`, logger);

  const redis = new AsyncRedisClient({
    host,
    port,
  });
  try {
    await redis.flushall();
    logger.info("Redis data cleared");
  } finally {
    await redis.close();
  }
};

main().catch(logger.error);
