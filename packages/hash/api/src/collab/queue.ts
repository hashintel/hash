import { AsyncRedisClient } from "@hashintel/hash-backend-utils/redis";
import { RedisQueueExclusiveConsumer } from "@hashintel/hash-backend-utils/queue/redis";
import { Repeater } from "@hashintel/hash-backend-utils/timers";
import { getRequiredEnv } from "../util";
import { logger } from "../logger";

export const redisClientConfig = {
  host: getRequiredEnv("HASH_REDIS_HOST"),
  port: parseInt(getRequiredEnv("HASH_REDIS_PORT"), 10),
};

const collabRedisClient = new AsyncRedisClient(redisClientConfig);
const queue = new RedisQueueExclusiveConsumer(collabRedisClient);
export const QUEUE_NAME = getRequiredEnv("HASH_COLLAB_QUEUE_NAME");

export const queuePromise = (async () => {
  logger.info(`Acquiring read ownership on queue "${QUEUE_NAME}" ...`);

  const repeater = new Repeater(async () => {
    const res = await queue.acquire(QUEUE_NAME, 5_000);
    if (!res) {
      logger.info(
        "Queue is owned by another consumer. Attempting to acquire ownership again ...",
      );
    }
    return res;
  });

  await repeater.start();

  return queue;
})();

export function shutdownQueue() {
  queue
    .release()
    .then(() => collabRedisClient.close())
    .then(() => logger.info("Collab redis connection closed"))
    .catch((err) => logger.error(err));
}
