import { randomUUID } from "crypto";

import { QueueProducer, QueueExclusiveConsumer } from "./adapter";
import { AsyncRedisClient } from "../redis";

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

/**
 * An implementation of the `QueueExclusiveConsumer` interface based on Redis.
 */
export class RedisQueueExclusiveConsumer implements QueueExclusiveConsumer {
  private client: AsyncRedisClient;

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

  async acquire(name: string, timeout: number | null): Promise<boolean> {
    if (timeout && timeout < 1000) {
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
    while (timeout ? Date.now() - start < timeout : true) {
      const ttl = await this.client.ttl(this.ownerKey(name)); // seconds
      const ttlMillis = ttl * 1000;
      if (timeout && Date.now() + ttlMillis - start > timeout) {
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
      await new Promise((resolve) => setTimeout(resolve, ttlMillis + 100));
    }

    return false;
  }

  async release(): Promise<void> {
    if (this.queueOwned) {
      clearInterval(this.queueOwned.interval);
      this.queueOwned = undefined;
    }
  }

  /** Pop an item from the queue and execute the callback on it. The items stays on
   * the queue if the callback throws an error. If timeout is `null`, it blocks until
   * an item appears on the queue.
   */
  private async _pop<T>(
    name: string,
    timeout: number | null,
    cb: (item: string) => Promise<T>
  ): Promise<T | null> {
    if (timeout && timeout < 0) {
      throw new Error("timeout must be positive or zero");
    }
    if (!this.ownershipIsValid(name)) {
      throw new Error(`consumer does not own queue "${name}"`);
    }

    // Check if there's an item which wasn't processed correctly on the last call
    const processingName = `${name}-processing`;
    let item = await this.client.rpoplpush(processingName, processingName);

    if (!item) {
      // Pop from the main queue and push onto the processing queue.
      item =
        timeout === 0
          ? // Non-blocking
            await this.client.rpoplpush(name, processingName)
          : timeout === null
          ? // Blocking
            await this.client.brpoplpush(name, processingName, 0)
          : // Blocking with timeout
            await this.client.brpoplpush(name, processingName, timeout / 1000);
    }

    if (timeout && !item) {
      // The timeout was reached.
      return null;
    }

    const result = await cb(item!);

    // The callback has succeeded. Remove the item from the processing queue.
    await this.client.lpop(processingName);

    return result;
  }

  async popBlocking<T>(
    name: string,
    cb: (item: string) => Promise<T>
  ): Promise<T> {
    return (await this._pop(name, null, cb))!;
  }

  async pop<T>(
    name: string,
    timeout: number,
    cb: (item: string) => Promise<T>
  ): Promise<T | null> {
    return this._pop(name, timeout, cb);
  }
}
