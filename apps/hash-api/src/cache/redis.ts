import type { Logger } from "@local/hash-backend-utils/logger";
import type { RedisSocketConfig } from "@local/hash-backend-utils/redis";
import { AsyncRedisClient } from "@local/hash-backend-utils/redis";
import { DataSource } from "apollo-datasource";

import type { CacheAdapter } from "./adapter";

export class RedisCache extends DataSource implements CacheAdapter {
  private client: AsyncRedisClient;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  setExpiring: (
    key: string,
    value: string,
    expiresInSeconds: number,
  ) => Promise<void>;

  rpush: (key: string, values: string[]) => Promise<number>;

  constructor(logger: Logger, cfg: RedisSocketConfig) {
    super();
    this.client = new AsyncRedisClient(logger, cfg);
    this.get = this.client.get;
    this.set = this.client.set;
    this.setExpiring = this.client.setex;
    this.rpush = this.client.rpush;
  }

  async close() {
    await this.client.close();
  }
}
