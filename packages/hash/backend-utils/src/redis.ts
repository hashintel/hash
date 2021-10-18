import { promisify } from "util";

import { createClient } from "redis";

export type RedisConfig = {
  host: string;
  port: number;
};

/** An async-await compatible wrapper around a `RedisClient`. */
export class AsyncRedisClient {
  /** Pop an item from the right side of the `src` list and push it onto the left side
   * of the `dst` list. If `src` is empty, it blocks until an item appears. */
  brpoplpush: (
    src: string,
    dst: string,
    timeout: number
  ) => Promise<string | null>;

  /** Pop an item from the right side of the `src` list and push it onto the left side
   * of the `dst` list. */
  rpoplpush: (src: string, dst: string) => Promise<string | null>;

  /** Pop an item from the left side of a list, if the list exists. */
  lpop: (key: string) => Promise<string | null>;

  /** Push one or more values onto the left side of a list. Returns the new size of the
   * list. */
  lpush: (key: string, ...values: string[]) => Promise<number>;

  /** Push one or more values onto the right side of a list. Returns the new size of the
   * list. */
  rpush: (key: string, ...values: string[]) => Promise<number>;

  /** Get a value, if it exists. */
  get: (key: string) => Promise<string | null>;

  /** Set a value. */
  set: (key: string, value: string) => Promise<null>;

  /** Get the TTL of a value. Returns a negative value if the key is not set, or if
   * the key does not have a TTL. */
  ttl: (key: string) => Promise<number>;

  /** Set a value if `key` does not exist. Returns 1 if the key was set, 0 otherwise. */
  setnx: (key: string, value: string) => Promise<number>;

  /** Set the expiration of a `key` in seconds. Returns 1 if the expiry was set. */
  expire: (key: string, seconds: number) => Promise<number>;

  constructor(cfg: RedisConfig) {
    const client = createClient(cfg);
    this.brpoplpush = promisify(client.brpoplpush).bind(client);
    this.rpoplpush = promisify(client.rpoplpush).bind(client);
    this.lpop = promisify(client.lpop).bind(client);
    this.get = promisify(client.get).bind(client);
    this.ttl = promisify(client.ttl).bind(client);
    this.setnx = promisify(client.setnx).bind(client);
    this.expire = promisify(client.expire).bind(client);
    this.lpush = promisify(client.lpush).bind(client);
    this.rpush = promisify(client.rpush).bind(client);
    this.set = async (key: string, value: string) => {
      await promisify(client.set).bind(client)(key, value);
      return null;
    };
  }
}
