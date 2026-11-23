import type {
  LiveToolEvent,
  LiveToolEventInput,
} from "../shared/live-tool-event";

type Subscription = {
  readonly close: () => void;
  readonly closed: Promise<void>;
  readonly events: AsyncIterable<LiveToolEvent>;
};

type Subscriber = {
  readonly attach: () => void;
  readonly push: (event: LiveToolEvent) => boolean;
  readonly finish: () => void;
  readonly submissionId: string;
};

type InstanceEntry = {
  readonly activeSubmissions: Set<string>;
  lastActivityAt: number;
  nextSequence: number;
  readonly retained: LiveToolEvent[];
  readonly subscribers: Set<Subscriber>;
};

export type LiveToolBroadcaster = {
  readonly activate: (instanceId: string, submissionId: string) => void;
  readonly close: () => void;
  readonly publish: (event: LiveToolEventInput) => void;
  readonly stats: () => {
    readonly instances: number;
    readonly subscribers: number;
  };
  readonly subscribe: (
    instanceId: string,
    submissionId: string,
  ) => Subscription;
};

export type LiveToolBroadcasterOptions = {
  readonly maxInstances?: number;
  readonly maxQueuedEvents?: number;
  readonly maxRetainedEvents?: number;
  readonly retentionMs?: number;
};

const defaultOptions = {
  maxInstances: 64,
  maxQueuedEvents: 128,
  maxRetainedEvents: 64,
  retentionMs: 30_000,
} as const;

/**
 * How long a subscriber for an unknown submission waits before closing when
 * no admission (`activate`) or event (`publish`) arrives for it: below the
 * 30 s SSE heartbeat, so unsubmitted streams close before any heartbeat fires.
 */
const unattachedGraceMs = 15_000;

const createSubscriber = (
  maxQueuedEvents: number,
  release: () => void,
  submissionId: string,
  unattachedGraceMs: number | undefined,
): Subscriber & {
  readonly closed: Promise<void>;
  readonly events: AsyncIterable<LiveToolEvent>;
} => {
  const queue: LiveToolEvent[] = [];
  const closed = Promise.withResolvers<void>();
  let finished = false;
  let waiting:
    | ((result: IteratorResult<LiveToolEvent, undefined>) => void)
    | undefined;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;

  const clearGrace = (): void => {
    if (graceTimer !== undefined) {
      clearTimeout(graceTimer);
      graceTimer = undefined;
    }
  };

  const finish = (): void => {
    if (finished) return;
    finished = true;
    clearGrace();
    queue.length = 0;
    waiting?.({ done: true, value: undefined });
    waiting = undefined;
    release();
    closed.resolve();
  };

  if (unattachedGraceMs !== undefined) {
    graceTimer = setTimeout(finish, unattachedGraceMs);
  }

  return {
    attach: clearGrace,
    closed: closed.promise,
    events: {
      [Symbol.asyncIterator]() {
        return {
          next: () => {
            const event = queue.shift();
            if (event !== undefined) {
              return Promise.resolve({ done: false as const, value: event });
            }
            if (finished) {
              return Promise.resolve({
                done: true as const,
                value: undefined,
              });
            }
            return new Promise<IteratorResult<LiveToolEvent, undefined>>(
              (resolve) => {
                waiting = resolve;
              },
            );
          },
          return: () => {
            finish();
            return Promise.resolve({
              done: true as const,
              value: undefined,
            });
          },
        };
      },
    },
    finish,
    submissionId,
    push: (event) => {
      if (finished) return false;
      clearGrace();
      if (waiting !== undefined) {
        const resolve = waiting;
        waiting = undefined;
        resolve({ done: false, value: event });
        return true;
      }
      if (queue.length >= maxQueuedEvents) {
        finish();
        return false;
      }
      queue.push(event);
      return true;
    },
  };
};

export const createLiveToolBroadcaster = (
  options: LiveToolBroadcasterOptions = {},
): LiveToolBroadcaster => {
  const configured = { ...defaultOptions, ...options };
  // A subscriber replays the retained window into its queue before reading,
  // so the queue must keep room for at least one live event after replay.
  if (configured.maxRetainedEvents >= configured.maxQueuedEvents) {
    throw new Error(
      "The live tool broadcaster must retain fewer events than a subscriber can queue.",
    );
  }
  const instances = new Map<string, InstanceEntry>();
  let closed = false;

  const isUnattached = (entry: InstanceEntry): boolean =>
    entry.activeSubmissions.size === 0 && entry.retained.length === 0;

  const releaseExpired = (now: number): void => {
    for (const [instanceId, entry] of instances) {
      if (
        entry.subscribers.size === 0 &&
        now - entry.lastActivityAt >= configured.retentionMs
      ) {
        instances.delete(instanceId);
      }
    }
  };

  const oldestEntry = (
    predicate: (entry: InstanceEntry) => boolean,
  ): [string, InstanceEntry] | undefined =>
    [...instances.entries()]
      .filter(([, entry]) => predicate(entry))
      .toSorted(
        ([, left], [, right]) => left.lastActivityAt - right.lastActivityAt,
      )
      .at(0);

  const entryFor = (instanceId: string): InstanceEntry | undefined => {
    const now = Date.now();
    releaseExpired(now);
    const existing = instances.get(instanceId);
    if (existing !== undefined) {
      existing.lastActivityAt = now;
      return existing;
    }

    if (instances.size >= configured.maxInstances) {
      const releasable = oldestEntry((entry) => entry.subscribers.size === 0);
      if (releasable !== undefined) {
        instances.delete(releasable[0]);
      } else {
        const unattached = oldestEntry(isUnattached);
        if (unattached === undefined) return undefined;
        for (const subscriber of unattached[1].subscribers) {
          subscriber.finish();
        }
        instances.delete(unattached[0]);
      }
    }

    const created: InstanceEntry = {
      activeSubmissions: new Set(),
      lastActivityAt: now,
      nextSequence: 0,
      retained: [],
      subscribers: new Set(),
    };
    instances.set(instanceId, created);
    return created;
  };

  const subscribe = (
    instanceId: string,
    submissionId: string,
  ): Subscription => {
    if (closed) throw new Error("The live tool broadcaster is closed.");
    const entry = entryFor(instanceId);
    if (entry === undefined) {
      throw new Error("The live tool broadcaster is at subscriber capacity.");
    }
    let subscriber: Subscriber | undefined;
    const release = (): void => {
      if (subscriber === undefined) return;
      entry.subscribers.delete(subscriber);
      subscriber = undefined;
      if (
        entry.activeSubmissions.size === 0 &&
        entry.retained.length === 0 &&
        entry.subscribers.size === 0
      ) {
        instances.delete(instanceId);
      }
    };
    const attached =
      entry.activeSubmissions.has(submissionId) ||
      entry.retained.some((event) => event.submissionId === submissionId);
    const created = createSubscriber(
      configured.maxQueuedEvents,
      release,
      submissionId,
      attached ? undefined : unattachedGraceMs,
    );
    subscriber = created;
    entry.subscribers.add(created);
    for (const event of entry.retained) {
      if (event.submissionId === submissionId && !created.push(event)) break;
    }
    return {
      close: created.finish,
      closed: created.closed,
      events: created.events,
    };
  };

  return {
    activate: (instanceId, submissionId) => {
      if (closed) return;
      const entry = entryFor(instanceId);
      if (entry === undefined) return;
      entry.activeSubmissions.add(submissionId);
      for (const subscriber of entry.subscribers) {
        if (subscriber.submissionId === submissionId) subscriber.attach();
      }
    },
    close: () => {
      if (closed) return;
      closed = true;
      for (const entry of instances.values()) {
        for (const subscriber of entry.subscribers) subscriber.finish();
      }
      instances.clear();
    },
    publish: (input) => {
      if (closed) return;
      const entry = entryFor(input.instanceId);
      if (entry === undefined) return;
      if (input.kind === "submission-finished") {
        entry.activeSubmissions.delete(input.submissionId);
      }
      const event: LiveToolEvent = {
        ...input,
        sequence: entry.nextSequence++,
        v: 1,
      };
      entry.retained.push(event);
      if (entry.retained.length > configured.maxRetainedEvents) {
        entry.retained.splice(
          0,
          entry.retained.length - configured.maxRetainedEvents,
        );
      }
      for (const subscriber of entry.subscribers) {
        if (subscriber.submissionId === event.submissionId) {
          subscriber.push(event);
        }
      }
    },
    stats: () => ({
      instances: instances.size,
      subscribers: [...instances.values()].reduce(
        (count, entry) => count + entry.subscribers.size,
        0,
      ),
    }),
    subscribe,
  };
};
