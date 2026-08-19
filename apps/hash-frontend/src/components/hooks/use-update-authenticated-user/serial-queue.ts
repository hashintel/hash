type QueuedTask<T> = () => Promise<T>;

export type SerialQueue = {
  /**
   * Run `task` once every task enqueued before it has settled, and resolve with
   * whatever `task` resolves with.
   *
   * The task is not called until its turn comes, so it can read the state it
   * depends on then, rather than when it was enqueued, by which time an
   * earlier task may have changed it.
   */
  enqueue: <T>(task: QueuedTask<T>) => Promise<T>;
};

export const createSerialQueue = (): SerialQueue => {
  /**
   * The end of the chain. Always a promise which fulfills, so that one failing
   * task cannot stop the tasks queued behind it - see `enqueue`.
   */
  let tail: Promise<void> = Promise.resolve();

  return {
    enqueue: (task) => {
      const result = tail.then(task);

      /**
       * The chain continues from a promise which swallows any rejection, so
       * that a failed task does not poison the queue. The rejection is still
       * delivered to this caller, via `result`.
       */
      tail = result.then(
        () => undefined,
        () => undefined,
      );

      return result;
    },
  };
};

/**
 * Every update to the authenticated user patches the same entity, and the graph
 * rejects a patch which overlaps another with `RaceConditionOnUpdate`. The
 * components which update user preferences don't coordinate with each other,
 * and each has its own instance of `useUpdateAuthenticatedUser`, so the queue
 * they share is module scoped rather than per hook instance.
 *
 * It holds no user data, only the tail of a promise chain, and is only ever
 * touched from event handlers in the browser (never while rendering, so never
 * on the server).
 */
export const authenticatedUserUpdateQueue = createSerialQueue();
