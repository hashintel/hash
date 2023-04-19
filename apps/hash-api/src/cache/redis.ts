import { Logger } from "@local/hash-backend-utils/logger";
import {
  RedisClient,
  RedisConfig,
  setupRedisClient,
} from "@local/hash-backend-utils/redis";
import { DataSource } from "apollo-datasource";

import { CacheAdapter } from "./adapter";

export class RedisCache extends DataSource implements CacheAdapter {
  private client: RedisClient;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  setExpiring: (
    key: string,
    value: string,
    expiresInSeconds: number,
  ) => Promise<void>;

  rpush: (key: string, ...values: string[]) => Promise<number>;

  constructor(logger: Logger, cfg: RedisConfig) {
    super();
    this.client = setupRedisClient(logger, cfg);
    this.get = (key) => this.client.get(key);
    this.set = (key, value) => this.client.set(key, value).then();
    this.setExpiring = (key, value, expiry) =>
      this.client.setex(key, expiry, value).then();
    this.rpush = (key, ...values) => this.client.rpush(key, ...values);
  }

  async close() {
    await this.client.quit();
  }
}
