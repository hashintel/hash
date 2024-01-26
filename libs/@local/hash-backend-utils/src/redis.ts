import { DataSource } from "apollo-datasource";
import { createClient, RedisClientType } from "redis";

import { Logger } from "./logger";

export type RedisSocketConfig = {
  host: string;
  port: number;
  tls: boolean;
};

/** An async-await compatible wrapper around a `RedisClient`. */
export class AsyncRedisClient extends DataSource {
  private logger: Logger;
  /** Pop an item from the right side of the `src` list, push it onto the left side
   * of the `dst` list, and return the item. If the `src` list is empty, and
   * `timeoutSecs` is `0`, the function blocks indefinitely until an item arrives,
   * otherwise, it waits for the specified time, returning `null` if no new item arrives.
   * */
  brpoplpush: (
    src: string,
    dst: string,
    timeoutSecs: number,
  ) => Promise<string | null>;

  /** Pop an item from the right side of the `src` list, push it onto the left side of
   * the `dst` list and return the item. Returns `null` if the `src` queue is empty. */
  rpoplpush: (src: string, dst: string) => Promise<string | null>;

  /** Pop an item from the left side of a list, if the list exists. */
  lpop: (key: string) => Promise<string | null>;

  /** Push one or more values onto the left side of a list. Returns the new size of the
   * list. */
  lpush: RedisClientType["lPush"];

  /** Push one or more values onto the right side of a list. Returns the new size of the
   * list. */
  rpush: RedisClientType["rPush"];

  /** Returns the length of the list at `key`. */
  llen: (key: string) => Promise<number>;

  /** Get a value, if it exists. */
  get: (key: string) => Promise<string | null>;

  /** Set a value. */
  set: (key: string, value: string) => Promise<void>;

  /** Set a value with an expiration (in seconds). */
  setex: (key: string, value: string, expireInSeconds: number) => Promise<void>;

  /** Get the TTL of a value. Returns a negative value if the key is not set, or if
   * the key does not have a TTL. */
  ttl: (key: string) => Promise<number>;

  /** Set a value if `key` does not exist. Returns true if the key was set, false otherwise. */
  setnx: (key: string, value: string) => Promise<boolean>;

  /** Set the expiration of a `key` in seconds. Returns true if the expiry was set. */
  expire: (key: string, seconds: number) => Promise<boolean>;

  /** Flush all data. */
  flushall: () => Promise<void>;

  private quit: () => Promise<unknown>;

  constructor(logger: Logger, cfg: RedisSocketConfig) {
    super();
    this.logger = logger;

    const client = createClient({
      socket: {
        connectTimeout: 30_000,
        host: cfg.host,
        port: cfg.port,
        tls: cfg.tls,
      },
      pingInterval: 20_000,
    });

    // These are all the Redis events we can listen to, using them for logging.
    client.on("connect", () => {
      this.logger.debug("Redis client is connecting");
    });
    client.on("reconnecting", (params) =>
      this.logger.debug(`Redis reconnecting, attempt ${params.attempt}`),
    );
    client.on("ready", () => {
      this.logger.debug("Redis client is connected and ready.");
    });
    client.on("end", () => {
      this.logger.debug("Redis connection has been disconnected by client.");
    });
    client.on("error", (error) => {
      this.logger.error({
        message: "Redis connection lost",

        errorMessage: `${(error as Error).name}: ${(error as Error).message}`,
      });
    });
    // Keeping this one commented out because it sends too many messages
    // client.on("reconnecting", () => {
    //   this.logger.info("Redis client is trying to reconnect...");
    // });

    this.quit = client.quit.bind(client);
    this.brpoplpush = client.brPopLPush.bind(client);
    this.rpoplpush = client.rPopLPush.bind(client);
    this.lpop = client.lPop.bind(client);
    this.get = client.get.bind(client);
    this.ttl = client.ttl.bind(client);
    this.setnx = client.setNX.bind(client);
    this.expire = client.expire.bind(client);
    this.lpush = client.lPush.bind(client);
    this.rpush = client.rPush.bind(client);
    this.llen = client.lLen.bind(client);

    const flushall = client.flushAll.bind(client);
    this.flushall = async () => {
      await flushall();
    };

    const set = client.set.bind(client);
    this.set = async (key: string, value: string) => {
      await set(key, value);
    };

    const setex = client.setEx.bind(client);
    this.setex = async (
      key: string,
      value: string,
      expireInSeconds: number,
    ) => {
      await setex(key, expireInSeconds, value);
    };

    void client.connect();
  }

  /** Close the connection to the Redis server, waiting for all pending commands to
   * complete. */
  async close(): Promise<void> {
    await this.quit();
  }
}
