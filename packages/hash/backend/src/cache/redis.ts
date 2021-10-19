import { DataSource } from "apollo-datasource";
import {
  AsyncRedisClient,
  RedisConfig,
} from "@hashintel/hash-backend-utils/redis";

import { CacheAdapter } from "./adapter";

export class RedisCache extends DataSource implements CacheAdapter {
  private client: AsyncRedisClient;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<null>;
  rpush: (key: string, ...values: string[]) => Promise<number>;

  constructor(cfg: RedisConfig) {
    super();
    this.client = new AsyncRedisClient(cfg);
    this.get = this.client.get;
    this.set = this.client.set;
    this.rpush = this.client.rpush;
  }
}
