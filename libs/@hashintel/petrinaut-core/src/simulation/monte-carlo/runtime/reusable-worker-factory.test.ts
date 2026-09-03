import { describe, expect, it } from "vitest";

import { createReusableWorkerFactory } from "./reusable-worker-factory";

import type { WorkerLike } from "../../../environment";
import type {
  MonteCarloToMainMessage,
  MonteCarloToWorkerMessage,
} from "../worker/messages";

type Listener = (event: { data: MonteCarloToMainMessage }) => void;

const cancelled: MonteCarloToMainMessage = {
  type: "cancelled",
  progress: null,
};

/**
 * A worker double that records messages and dispatches by event type the way
 * a real worker does. With `autoAck` (the default) it answers `cancel` with
 * `cancelled` synchronously, like the in-process worker; `autoAck: false`
 * hands the test manual control over ack timing, which is how the real
 * browser worker behaves (acks arrive as later macrotasks).
 */
const fakeWorker = ({ autoAck = true }: { autoAck?: boolean } = {}) => {
  const listenersByType = new Map<string, Set<Listener>>();
  const posted: MonteCarloToWorkerMessage[] = [];
  let terminated = false;
  const emit = (data: MonteCarloToMainMessage) => {
    for (const listener of listenersByType.get("message") ?? []) {
      listener({ data });
    }
  };
  const worker: WorkerLike<MonteCarloToWorkerMessage, MonteCarloToMainMessage> =
    {
      postMessage: (message) => {
        posted.push(message);
        if (autoAck && message.type === "cancel") {
          emit(cancelled);
        }
      },
      addEventListener: (type, listener) => {
        let set = listenersByType.get(type);
        if (!set) {
          set = new Set();
          listenersByType.set(type, set);
        }
        set.add(listener);
      },
      removeEventListener: (type, listener) => {
        listenersByType.get(type)?.delete(listener);
      },
      terminate: () => {
        terminated = true;
      },
    };
  return {
    worker,
    posted,
    emit,
    messageListenerCount: () => listenersByType.get("message")?.size ?? 0,
    wasTerminated: () => terminated,
  };
};

type FakeWorker = ReturnType<typeof fakeWorker>;

const trackingFactory = (options?: { autoAck?: boolean }) => {
  const doubles: FakeWorker[] = [];
  const factory = createReusableWorkerFactory(() => {
    const double = fakeWorker(options);
    doubles.push(double);
    return double.worker;
  });
  return { factory, doubles };
};

describe("createReusableWorkerFactory", () => {
  it("reuses a released worker for the next lease", async () => {
    const { factory, doubles } = trackingFactory();

    const first = await factory();
    first.terminate();
    const second = await factory();
    second.postMessage({ type: "start" });

    expect(doubles).toHaveLength(1);
    expect(doubles[0]?.wasTerminated()).toBe(false);
    expect(doubles[0]?.posted).toEqual([{ type: "cancel" }, { type: "start" }]);
  });

  it("detaches the old lease's listeners so the next lease never hears it", async () => {
    const { factory, doubles } = trackingFactory();

    const first = await factory();
    const heard: MonteCarloToMainMessage[] = [];
    first.addEventListener("message", (event) => heard.push(event.data));
    first.terminate();

    doubles[0]?.emit({ type: "ready" });
    expect(heard).toEqual([]);
    expect(doubles[0]?.messageListenerCount()).toBe(0);
  });

  it("holds a worker out of the pool until every owed cancel is acknowledged", async () => {
    // The runtime's dispose path sends its own cancel through the lease right
    // before terminating it, so the worker owes two acks: pooling on the first
    // would let the second land on the next lease as its own shard settling.
    const { factory, doubles } = trackingFactory({ autoAck: false });

    const lease = await factory();
    lease.postMessage({ type: "cancel" });
    lease.terminate();

    doubles[0]?.emit(cancelled);
    const second = await factory();
    expect(doubles, "still owed one ack: not pooled").toHaveLength(2);

    doubles[0]?.emit(cancelled);
    const third = await factory();
    third.postMessage({ type: "start" });
    expect(doubles, "reset acknowledged: pooled and reused").toHaveLength(2);
    expect(doubles[0]?.posted.at(-1)).toEqual({ type: "start" });
    second.terminate();
  });

  it("does not owe acks the ending lease already observed", async () => {
    const { factory, doubles } = trackingFactory({ autoAck: false });

    const lease = await factory();
    lease.postMessage({ type: "cancel" });
    doubles[0]?.emit(cancelled);
    lease.terminate();

    doubles[0]?.emit(cancelled);
    await factory();
    expect(doubles).toHaveLength(1);
  });

  it("ignores non-cancelled traffic while waiting for the reset ack", async () => {
    const { factory, doubles } = trackingFactory({ autoAck: false });

    (await factory()).terminate();
    doubles[0]?.emit({ type: "ready" });
    const second = await factory();
    expect(doubles).toHaveLength(2);

    doubles[0]?.emit(cancelled);
    await factory();
    expect(doubles).toHaveLength(2);
    second.terminate();
  });

  it("terminates instead of pooling past maxIdle", async () => {
    const doubles: FakeWorker[] = [];
    const factory = createReusableWorkerFactory(
      () => {
        const double = fakeWorker();
        doubles.push(double);
        return double.worker;
      },
      { maxIdle: 1 },
    );

    const leases = await Promise.all([factory(), factory()]);
    for (const lease of leases) {
      lease.terminate();
    }

    expect(doubles).toHaveLength(2);
    expect(doubles.filter((double) => double.wasTerminated())).toHaveLength(1);
  });

  it("a worker that never acknowledges its reset is not reused", async () => {
    const doubles: FakeWorker[] = [];
    let mute = false;
    const factory = createReusableWorkerFactory(() => {
      const double = fakeWorker();
      doubles.push(double);
      if (mute) {
        return double.worker;
      }
      mute = true;
      // Swallow every post so the `cancelled` ack never comes back.
      return { ...double.worker, postMessage: () => {} };
    });

    (await factory()).terminate();
    await factory();

    expect(
      doubles,
      "the silent worker stays out; the lease got a fresh one",
    ).toHaveLength(2);
  });

  it("drain terminates workers awaiting their reset ack", async () => {
    const doubles: FakeWorker[] = [];
    const factory = createReusableWorkerFactory(() => {
      const double = fakeWorker();
      doubles.push(double);
      return { ...double.worker, postMessage: () => {} };
    });

    (await factory()).terminate();
    factory.drain();

    expect(doubles[0]?.wasTerminated()).toBe(true);
  });

  it("drain terminates every idle worker", async () => {
    const { factory, doubles } = trackingFactory();

    (await factory()).terminate();
    factory.drain();

    expect(doubles[0]?.wasTerminated()).toBe(true);
  });

  it("dispose shuts the pool: later releases terminate instead of pooling", async () => {
    const { factory, doubles } = trackingFactory();

    const idleLease = await factory();
    const activeLease = await factory();
    idleLease.terminate();
    factory.dispose();
    activeLease.terminate();

    expect(doubles).toHaveLength(2);
    expect(
      doubles.every((double) => double.wasTerminated()),
      "a handle disposed after the pool shut down kills its worker",
    ).toBe(true);
  });

  it("dispose kills a worker whose reset ack arrives afterwards", async () => {
    const { factory, doubles } = trackingFactory({ autoAck: false });

    (await factory()).terminate();
    factory.dispose();
    doubles[0]?.emit(cancelled);

    expect(doubles[0]?.wasTerminated()).toBe(true);
    const next = await factory();
    expect(doubles, "the late ack must not resurrect it").toHaveLength(2);
    next.terminate();
  });

  it("a lease ignores traffic after its own terminate", async () => {
    const factory = createReusableWorkerFactory(() => fakeWorker().worker);
    const lease = await factory();
    lease.terminate();
    lease.terminate();
    expect(() => lease.postMessage({ type: "start" })).not.toThrow();
  });
});
