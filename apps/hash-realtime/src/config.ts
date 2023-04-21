import { supportedRealtimeTables } from "@local/hash-backend-utils/realtime";
import { RedisConfig } from "@local/hash-backend-utils/redis";

// The tables to monitor for changes
export const MONITOR_TABLES = supportedRealtimeTables.map(
  (table) => `public.${table}`,
);

export const redisConfig: RedisConfig = {
  host: process.env.HASH_REDIS_HOST ?? "localhost",
  port: parseInt(process.env.HASH_REDIS_PORT ?? "6379", 10),
};
