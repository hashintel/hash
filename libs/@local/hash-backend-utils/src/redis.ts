import {
  createClient,
  type RedisClientOptions,
  type RedisClientType,
  type RedisFunctions,
  type RedisModules,
  type RedisScripts,
  type TypeMapping,
} from "redis";

import type { Logger } from "./logger.js";

interface ClientOptions<
  M extends RedisModules,
  F extends RedisFunctions,
  S extends RedisScripts,
> extends Omit<RedisClientOptions<M, F, S, 3, TypeMapping>, "RESP"> {
  logger: Logger;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type RedisClient<
  M extends RedisModules = {},
  F extends RedisFunctions = {},
  S extends RedisScripts = {},
> = RedisClientType<M, F, S, 3, TypeMapping>;

export const createRedisClient = <
  M extends RedisModules,
  F extends RedisFunctions,
  S extends RedisScripts,
>(
  options: ClientOptions<M, F, S>,
): RedisClientType<M, F, S, 3, TypeMapping> => {
  const { logger, ...rest } = options;

  return createClient({ ...rest, RESP: 3 })
    .on("connect", () => {
      logger.debug("Redis client is connecting");
    })
    .on("reconnecting", () => logger.debug(`Redis reconnecting...`))
    .on("ready", () => {
      logger.debug("Redis client is connected and ready.");
    })
    .on("end", () => {
      logger.debug("Redis connection has been disconnected by client.");
    })
    .on("error", (error) => {
      logger.error({
        message: "Redis connection lost",
        errorMessage: `${(error as Error).name}: ${(error as Error).message}`,
      });
    });
};
