import { DataSource } from "apollo-datasource";
import { Redis } from "ioredis";

export type RedisConfig = {
  host: string;
  port: number;
};

export type RedisClient = Redis & DataSource;

export const setupRedisClient = (cfg: RedisConfig): RedisClient => {
  const client = new Redis({
    host: cfg.host,
    port: cfg.port,
    retryStrategy: (times) => {
      if (times > 30) {
        throw new Error("could not connect to Redis server after 30 retries");
      }
    },
    maxLoadingRetryTime: 1000 * 30,
  });
  return client;
};
