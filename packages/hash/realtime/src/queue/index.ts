/** QueueProducer represents a resource which adds items to a queue. */
export interface QueueProducer {
  /**
   * Push one or more items onto a queue.
   * @param name the name of the queue.
   * @param items a collection of strings to add to the end of the queue.
   * @returns The number of items in the queue after the operation.
   * */
  push(name: string, ...items: string[]): Promise<number>;
}

/**
 * QueueExclusiveConsumer represents a queue consumer which has exclusive read
 * ownership over a queue.
 */
export interface QueueExclusiveConsumer {
  /**
   * Acquire exclusive read ownership of a queue. Any instance of `QueueExclusiveConsumer`
   * may only acquire ownership of a single queue. Attempts to acquire ownership on
   * multiple queues will result in an error.
   * @param name the name of the queue.
   * @param timeout the time, in milliseconds, to wait until the queue is acquired. Will
   * always wait at least 1 second.
   * @returns `true` if the queue was acquired, `false` otherwise.
   * */
  acquire(name: string, timeout: number): Promise<boolean>;

  /**
   * Release ownership of the queue currently owned by the consumer. This function has
   * no effect if the consumer is not in possession of a queue.
   * @param name the name of the queue
   */
  release(): Promise<null>;

  /**
   * Pop an item from the queue, and invoke the provided callback with this
   * item. If the callback throws an error, the item is put back on the queue,
   * otherwise, if the callback successfully completes, the item is removed permanently
   * If the queue is empty, this function will block until a `QueueProducer` adds an item.
   * @param name the name of the queue. Must have been previously acquired.
   * @param cb the callback function to execute with an item from the queue.
   * @returns the return value of `cb`.
   * @throws if the consumer is not in possession of the queue.
   */
  pop<T>(name: string, cb: (item: string) => Promise<T>): Promise<T>;
}
