import { Logger } from "@hashintel/hash-backend-utils/logger";
import {
  AsyncRedisClient,
  RedisConfig,
} from "@hashintel/hash-backend-utils/redis";
import { DataSource } from "apollo-datasource";

import { CacheAdapter } from "./adapter";

export class RedisCache extends DataSource implements CacheAdapter {
  private client: AsyncRedisClient;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  rpush: (key: string, ...values: string[]) => Promise<number>;

  constructor(logger: Logger, cfg: RedisConfig) {
    super();
    this.client = new AsyncRedisClient(logger, cfg);
    this.get = this.client.get;
    this.set = this.client.set;
    this.rpush = this.client.rpush;
  }

  async close() {
    await this.client.close();
  }
}
