import { JsonObject } from "@blockprotocol/core/.";

/** StreamProducer represents a resource which adds items to a stream. */
export interface StreamProducer<T> {
  /**
   * Push one or more items onto a stream.
   * @param payload - an object to JSON Serialize and add to the stream
   * @param id - an entry id, can be auto-generated
   * @returns The number of items in the queue after the operation
   * */
  push(payload: T): Promise<void>;
}

/**
 * StreamConsumer represents a stream consumer which does not belong to a consumer group
 */
export interface StreamConsumer {
  /**
   * Reads an item from the stream. This will block until an item is available.
   * @returns The next items in the stream
   */
  readNext(): Promise<JsonObject[]>;

  /** @todo consider adding something like `readNextFromStart`? */
}
