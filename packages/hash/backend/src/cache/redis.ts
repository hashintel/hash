import { promisify } from "util";

import { createClient, RedisClient } from "redis";
import { DataSource } from "apollo-datasource";

import { CacheAdapter } from "./adapter";

export type RedisConfig = {
  host: string;
  port: number;
};

export class RedisCache extends DataSource implements CacheAdapter {
  private client: RedisClient;
  private aget: (key: string) => Promise<string | null>;
  private aset: (key: string, value: string) => Promise<unknown>;

  constructor(cfg: RedisConfig) {
    super();
    this.client = createClient(cfg);
    this.aget = promisify(this.client.get).bind(this.client);
    this.aset = promisify(this.client.set).bind(this.client);
  }

  async get(key: string) {
    return this.aget(key);
  }

  async set(key: string, value: string) {
    await this.aset(key, value);
    return null;
  }
}
