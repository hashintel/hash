import { promisify } from "util";
import { randomUUID } from "crypto";

import { createClient } from "redis";

import { QueueProducer, QueueExclusiveConsumer } from ".";

// The interval on which a consumer which owns the queue will re-affirm their ownership.
const QUEUE_CONSUMER_OWNERSHIP_HEARTBEAT_MILLIS = 3000;

// If a consumer which owns the queue does not re-affirm their ownership within this
// interval, their ownership is voided and another consumer may acquire the queue.
const QUEUE_CONSUMER_OWNERSHIP_TIMEOUT_MILLIS = 5000;

/**
 * An implementation of the `QueueProducer` interface based on Redis.
 */
export class RedisQueueProducer implements QueueProducer {
  private client: AsyncRedisClient;

  constructor(client: AsyncRedisClient) {
    this.client = client;
  }

  push(name: string, ...items: string[]): Promise<number> {
    return this.client.lpush(name, ...items);
  }
}

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

  /** Get an value, if it exists. */
  get: (key: string) => Promise<string | null>;

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
  }
}

/**
 * An implementation of the `QueueExclusiveConsumer` interface based on Redis.
 */
export class RedisQueueExclusiveConsumer implements QueueExclusiveConsumer {
  client: AsyncRedisClient;

  // A unique identifier for this consumer. Used to signify ownership of the queue.
  private consumerId: string;

  // The name of the queue which this consumer has acquired, if any.
  private queueOwned?: {
    name: string;
    lastUpdated: number;
    interval: NodeJS.Timer;
  };

  constructor(client: AsyncRedisClient) {
    this.client = client;
    this.consumerId = randomUUID();
  }

  private ownerKey(name: string) {
    return `${name}-owner`;
  }

  private async setOwnership(name: string) {
    const heartbeat = QUEUE_CONSUMER_OWNERSHIP_HEARTBEAT_MILLIS;
    const interval = setInterval(() => this.updateOwnership(name), heartbeat);
    this.queueOwned = { name, lastUpdated: Date.now(), interval };
    await this.updateOwnership(name);
  }

  private async updateOwnership(name: string) {
    if (!this.ownershipIsValid(name)) {
      await this.release();
      return;
    }
    if (this.queueOwned === undefined) {
      return;
    }
    await this.client.expire(
      this.ownerKey(name),
      QUEUE_CONSUMER_OWNERSHIP_TIMEOUT_MILLIS / 1000
    );
    this.queueOwned!.lastUpdated = Date.now();
  }

  private ownershipIsValid(name: string): boolean {
    const timeout = QUEUE_CONSUMER_OWNERSHIP_TIMEOUT_MILLIS;
    return (
      this.queueOwned !== undefined &&
      this.queueOwned.name === name &&
      this.queueOwned.lastUpdated + timeout > Date.now()
    );
  }

  async acquire(name: string, timeout: number): Promise<boolean> {
    if (timeout < 1000) {
      throw new Error("timeout must be at least 1000 milliseconds");
    }
    if (this.queueOwned && this.queueOwned!.name === name) {
      // Queue is already acquired
      return true;
    }
    if (this.queueOwned && this.queueOwned!.name !== name) {
      throw new Error("consumer has already acquired a different queue");
    }

    // Check if the queue already has an exclusive consumer, and if not, acquire it.
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const ttl = await this.client.ttl(this.ownerKey(name)); // seconds
      if (Date.now() + ttl * 1000 - start > timeout) {
        // The TTL is longer than the timeout. No point in trying again.
        return false;
      }
      if (ttl < 0) {
        // Set this consumer as the owner. There may be a race condition where two
        // consumers attempt to acquire ownership of a free queue at the same time. By
        // using `setnx` we can set the key only if it does not already have a value.
        const isSet = await this.client.setnx(
          this.ownerKey(name),
          this.consumerId
        );
        if (!isSet) {
          continue;
        }
        await this.setOwnership(name);
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, ttl * 1000 + 100));
    }

    return false;
  }

  async release(): Promise<null> {
    if (this.queueOwned) {
      clearInterval(this.queueOwned.interval);
      this.queueOwned = undefined;
    }
    return null;
  }

  async pop<T>(name: string, cb: (item: string) => Promise<T>): Promise<T> {
    if (!this.ownershipIsValid(name)) {
      throw new Error(`consumer does not own queue "${name}"`);
    }
    // Check if there's an item which wasn't processed correctly on the last call
    const processingName = `${name}-processing`;
    let item = await this.client.rpoplpush(processingName, processingName);
    const inProcessing = item !== null;

    // Otherwise, get an item from the main queue and temporarily put it on the
    // processing queue. This blocks until an item arrives.
    if (!inProcessing) {
      item = await this.client.brpoplpush(name, processingName, 0);
    }
    if (!item) {
      // Should never happen
      throw new Error("item is null");
    }

    const result = await cb(item);

    // The callback has succeeded. Remove the item from the processing queue.
    await this.client.lpop(processingName);

    return result;
  }
}
