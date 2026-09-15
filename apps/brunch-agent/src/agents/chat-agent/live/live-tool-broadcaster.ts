import type { LiveToolEvent, LiveToolEventInput } from "./live-tool-event.ts";

type Subscription = {
  readonly close: () => void;
  readonly events: AsyncIterable<LiveToolEvent>;
};

type Subscriber = {
  readonly push: (event: LiveToolEvent) => boolean;
  readonly finish: () => void;
  readonly submissionId: string;
};

type InstanceEntry = {
  lastActivityAt: number;
  nextSequence: number;
  readonly retained: LiveToolEvent[];
  readonly subscribers: Set<Subscriber>;
};

export type LiveToolBroadcaster = {
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
  maxQueuedEvents: 64,
  maxRetainedEvents: 64,
  retentionMs: 30_000,
} as const;

const createSubscriber = (
  maxQueuedEvents: number,
  release: () => void,
  submissionId: string,
): Subscriber & { readonly events: AsyncIterable<LiveToolEvent> } => {
  const queue: LiveToolEvent[] = [];
  let finished = false;
  let waiting:
    | ((result: IteratorResult<LiveToolEvent, undefined>) => void)
    | undefined;

  const finish = (): void => {
    if (finished) return;
    finished = true;
    queue.length = 0;
    waiting?.({ done: true, value: undefined });
    waiting = undefined;
    release();
  };

  return {
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
  const instances = new Map<string, InstanceEntry>();
  let closed = false;

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

  const entryFor = (instanceId: string): InstanceEntry | undefined => {
    const now = Date.now();
    releaseExpired(now);
    const existing = instances.get(instanceId);
    if (existing !== undefined) {
      existing.lastActivityAt = now;
      return existing;
    }

    if (instances.size >= configured.maxInstances) {
      const releasable = [...instances.entries()]
        .filter(([, entry]) => entry.subscribers.size === 0)
        .toSorted(
          ([, left], [, right]) => left.lastActivityAt - right.lastActivityAt,
        )
        .at(0);
      if (releasable === undefined) return undefined;
      instances.delete(releasable[0]);
    }

    const created: InstanceEntry = {
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
      if (entry.retained.length === 0 && entry.subscribers.size === 0) {
        instances.delete(instanceId);
      }
    };
    const created = createSubscriber(
      configured.maxQueuedEvents,
      release,
      submissionId,
    );
    subscriber = created;
    entry.subscribers.add(created);
    for (const event of entry.retained) {
      if (event.submissionId === submissionId && !created.push(event)) break;
    }
    return { close: created.finish, events: created.events };
  };

  return {
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
      const event = {
        ...input,
        sequence: entry.nextSequence++,
        v: 1,
      } as LiveToolEvent;
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
