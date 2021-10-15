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
  private _get: (key: string) => Promise<string | null>;
  private _set: (key: string, value: string) => Promise<unknown>;
  private _rpush: (key: string, ...values: string[]) => Promise<number>;

  constructor(cfg: RedisConfig) {
    super();
    this.client = createClient(cfg);
    this._get = promisify(this.client.get).bind(this.client);
    this._set = promisify(this.client.set).bind(this.client);
    this._rpush = promisify(this.client.rpush).bind(this.client);
  }

  async get(key: string) {
    return this._get(key);
  }

  async set(key: string, value: string) {
    await this._set(key, value);
    return null;
  }

  async rpush(key: string, ...values: string[]) {
    return this._rpush(key, ...values);
  }
}
