import { randomUUID } from "node:crypto";

import { AsyncRedisClient } from "../redis";
import { sleep } from "../utils";
import { QueueExclusiveConsumer, QueueProducer } from "./adapter";

// The interval on which a consumer which owns the queue will re-affirm their ownership.
const QUEUE_CONSUMER_OWNERSHIP_HEARTBEAT_MS = 3_000;

// If a consumer which owns the queue does not re-affirm their ownership within this
// interval, their ownership is voided and another consumer may acquire the queue.
const QUEUE_CONSUMER_OWNERSHIP_TIMEOUT_MS = 5_000;

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
    const heartbeat = QUEUE_CONSUMER_OWNERSHIP_HEARTBEAT_MS;
    const interval = setInterval(() => {
      void this.updateOwnership(name);
    }, heartbeat);
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
      QUEUE_CONSUMER_OWNERSHIP_TIMEOUT_MS / 1000,
    );
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- false positive (because of await)
    if (this.queueOwned) {
      this.queueOwned.lastUpdated = Date.now();
    }
  }

  private ownershipIsValid(name: string): boolean {
    const timeout = QUEUE_CONSUMER_OWNERSHIP_TIMEOUT_MS;
    return (
      this.queueOwned !== undefined &&
      this.queueOwned.name === name &&
      this.queueOwned.lastUpdated + timeout > Date.now()
    );
  }

  /** Attempt to acquire the queue. If `timeoutMs` is `null` then this function will
   * block indefinitely until the queue is acquired. Otherwise, it will continue trying
   * to acquire the queue for the specified time period.
   */
  private async _acquire(
    name: string,
    timeoutMs: number | null,
  ): Promise<boolean> {
    const timeout = timeoutMs === null ? null : Math.min(timeoutMs, 1000);
    if (this.queueOwned && this.queueOwned.name === name) {
      // Queue is already acquired
      return true;
    }
    if (this.queueOwned && this.queueOwned.name !== name) {
      throw new Error("consumer has already acquired a different queue");
    }

    // Check if the queue already has an exclusive consumer, and if not, acquire it.
    const start = Date.now();
    while (timeout ? Date.now() - start < timeout : true) {
      const ttl = await this.client.ttl(this.ownerKey(name)); // seconds
      const ttlMs = ttl * 1000;
      if (timeout && Date.now() + ttlMs - start > timeout) {
        // The TTL is longer than the timeout. No point in trying again.
        return false;
      }
      if (ttl < 0) {
        // Set this consumer as the owner. There may be a race condition where two
        // consumers attempt to acquire ownership of a free queue at the same time. By
        // using `setnx` we can set the key only if it does not already have a value.
        const isSet = await this.client.setnx(
          this.ownerKey(name),
          this.consumerId,
        );
        if (!isSet) {
          continue;
        }
        await this.setOwnership(name);
        return true;
      }
      await sleep(ttlMs + 100);
    }

    return false;
  }

  async acquireBlocking(name: string): Promise<void> {
    await this._acquire(name, null);
  }

  async acquire(name: string, timeoutMs: number) {
    return await this._acquire(name, timeoutMs);
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- using async to match QueueExclusiveConsumer interface
  async release(): Promise<void> {
    if (this.queueOwned) {
      clearInterval(this.queueOwned.interval);
      this.queueOwned = undefined;
    }
  }

  processingName(name: string) {
    return `${name}-processing`;
  }

  /** Pop an item from the queue and execute the callback on it. The items stays on
   * the queue if the callback throws an error. To match the Redis API, the behavior
   * of this function depends on the value of `timeoutMs`:
   *   - timemoutMs === 0: blocks indefinitely until an item appears on the queue.
   *   - timeoutMs > 0: blocks for at most timeoutMs until an item appears on the queue.
   *   - timeoutMs < 0: throws an error
   *   - timeoutMs === null: checks once for an item on the queue and returns immediately.
   */
  private async _pop<T>(
    name: string,
    timeoutMs: number | null,
    cb: (item: string) => Promise<T>,
  ): Promise<T | null> {
    if (timeoutMs !== null && timeoutMs < 0) {
      throw new Error("`timeoutMs` must be non-negative");
    }
    if (!this.ownershipIsValid(name)) {
      throw new Error(`consumer does not own queue "${name}"`);
    }

    // Check if there's an item which wasn't processed correctly on the last call
    const processingName = this.processingName(name);
    let item = await this.client.rpoplpush(processingName, processingName);

    // Otherwise, pop from the main queue and push onto the processing queue.
    if (!item) {
      item =
        timeoutMs === null
          ? // Non-blocking
            await this.client.rpoplpush(name, processingName)
          : // Block indefinitely
          timeoutMs === 0
          ? await this.client.brpoplpush(name, processingName, 0)
          : // Block with timeout
            await this.client.brpoplpush(
              name,
              processingName,
              timeoutMs / 1000,
            );
    }

    if (!item) {
      // The timeout was reached.
      return null;
    }

    const result = await cb(item);

    // The callback has succeeded. Remove the item from the processing queue.
    await this.client.lpop(processingName);

    return result;
  }

  async popBlocking<T>(
    name: string,
    cb: (item: string) => Promise<T>,
  ): Promise<T> {
    return (await this._pop(name, 0, cb))!;
  }

  async pop<T>(
    name: string,
    timeoutMs: number | null,
    cb: (item: string) => Promise<T>,
  ): Promise<T | null> {
    return this._pop(name, timeoutMs, cb);
  }

  async length(name: string) {
    const [mainLen, processingLen] = await Promise.all([
      this.client.llen(name),
      this.client.llen(this.processingName(name)),
    ]);
    return mainLen + processingLen;
  }
}
