import { describe, expect, it } from "vitest";

import { createReusableWorkerFactory } from "./reusable-worker-factory";

import type { WorkerLike } from "../../environment";

type Listener = (event: { data: unknown }) => void;

/**
 * A worker double that records messages and dispatches by event type the way
 * a real worker does. With `autoAck` (the default) it answers `cancel` with
 * `cancelled` synchronously, like the in-process worker; `autoAck: false`
 * hands the test manual control over ack timing, which is how the real
 * browser worker behaves (acks arrive as later macrotasks).
 */
function fakeWorker({ autoAck = true }: { autoAck?: boolean } = {}) {
  const listenersByType = new Map<string, Set<Listener>>();
  const posted: unknown[] = [];
  let terminated = false;
  const emit = (data: unknown) => {
    for (const listener of listenersByType.get("message") ?? []) {
      listener({ data });
    }
  };
  const worker: WorkerLike = {
    postMessage: (message) => {
      posted.push(message);
      if (autoAck && (message as { type?: unknown }).type === "cancel") {
        emit({ type: "cancelled" });
      }
    },
    addEventListener: (type, listener) => {
      let set = listenersByType.get(type);
      if (!set) {
        set = new Set();
        listenersByType.set(type, set);
      }
      set.add(listener as Listener);
    },
    removeEventListener: (type, listener) => {
      listenersByType.get(type)?.delete(listener as Listener);
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
}

function trackingFactory(options?: { autoAck?: boolean }) {
  const doubles: ReturnType<typeof fakeWorker>[] = [];
  const factory = createReusableWorkerFactory(() => {
    const double = fakeWorker(options);
    doubles.push(double);
    return double.worker;
  });
  return { factory, doubles };
}

describe("createReusableWorkerFactory", () => {
  it("reuses a released worker for the next lease", async () => {
    const { factory, doubles } = trackingFactory();

    const first = await factory();
    first.terminate();
    const second = await factory();
    second.postMessage({ type: "init" });

    expect(doubles).toHaveLength(1);
    expect(doubles[0]!.wasTerminated()).toBe(false);
    // The release reset the worker, then the new lease reached it.
    expect(doubles[0]!.posted).toEqual([{ type: "cancel" }, { type: "init" }]);
  });

  it("detaches the old lease's listeners so the next lease never hears it", async () => {
    const { factory, doubles } = trackingFactory();

    const first = await factory();
    const heard: unknown[] = [];
    first.addEventListener("message", (event: { data: unknown }) =>
      heard.push(event.data),
    );
    first.terminate();

    // The reset already completed (auto-ack); stray traffic goes nowhere.
    doubles[0]!.emit({ type: "stale traffic" });
    expect(heard).toEqual([]);
    // The reset ack listener consumed itself; lease listeners are gone.
    expect(doubles[0]!.messageListenerCount()).toBe(0);
  });

  it("holds a worker out of the pool until every owed cancel is acknowledged", async () => {
    // The runtime's dispose path sends its own cancel through the lease right
    // before terminating it. The worker then owes TWO acks (that one and the
    // reset's), delivered later; pooling on the first would let the second
    // land on the next lease, where the runtime reads it as its shard
    // settling. This is the race the ack gate exists for.
    const { factory, doubles } = trackingFactory({ autoAck: false });

    const lease = await factory();
    lease.postMessage({ type: "cancel" });
    lease.terminate();

    // Ack #1 (the dispose-cancel's): still owed one, so not pooled.
    doubles[0]!.emit({ type: "cancelled" });
    const second = await factory();
    expect(doubles).toHaveLength(2);

    // Ack #2 (the reset's own): now pooled, and the next lease reuses it.
    doubles[0]!.emit({ type: "cancelled" });
    const third = await factory();
    third.postMessage({ type: "init" });
    expect(doubles).toHaveLength(2);
    expect(doubles[0]!.posted.at(-1)).toEqual({ type: "init" });
    second.terminate();
  });

  it("does not owe acks the ending lease already observed", async () => {
    const { factory, doubles } = trackingFactory({ autoAck: false });

    const lease = await factory();
    lease.postMessage({ type: "cancel" });
    // The ack arrives while the lease is still active — nothing is owed.
    doubles[0]!.emit({ type: "cancelled" });
    lease.terminate();

    // Only the reset's own ack gates the pool now.
    doubles[0]!.emit({ type: "cancelled" });
    await factory();
    expect(doubles).toHaveLength(1);
  });

  it("ignores non-cancelled traffic while waiting for the reset ack", async () => {
    const { factory, doubles } = trackingFactory({ autoAck: false });

    (await factory()).terminate();
    doubles[0]!.emit({ type: "progress", progress: {} });
    const second = await factory();
    expect(doubles).toHaveLength(2);

    doubles[0]!.emit({ type: "cancelled" });
    await factory();
    expect(doubles).toHaveLength(2);
    second.terminate();
  });

  it("terminates instead of pooling past maxIdle", async () => {
    const doubles: ReturnType<typeof fakeWorker>[] = [];
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

    const terminated = doubles.filter((d) => d.wasTerminated());
    expect(doubles).toHaveLength(2);
    expect(terminated).toHaveLength(1);
  });

  it("a worker that never acknowledges its reset is not reused", async () => {
    const doubles: ReturnType<typeof fakeWorker>[] = [];
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

    // The silent worker stays quarantined; the lease got a fresh one.
    expect(doubles).toHaveLength(2);
  });

  it("drain terminates workers awaiting their reset ack", async () => {
    const doubles: ReturnType<typeof fakeWorker>[] = [];
    const factory = createReusableWorkerFactory(() => {
      const double = fakeWorker();
      doubles.push(double);
      // Swallow the cancel so the ack never arrives before the drain.
      return { ...double.worker, postMessage: () => {} };
    });

    (await factory()).terminate();
    factory.drain();

    expect(doubles[0]!.wasTerminated()).toBe(true);
  });

  it("drain terminates every idle worker", async () => {
    const { factory, doubles } = trackingFactory();

    (await factory()).terminate();
    factory.drain();

    expect(doubles[0]!.wasTerminated()).toBe(true);
  });

  it("dispose shuts the pool: later releases terminate instead of pooling", async () => {
    const { factory, doubles } = trackingFactory();

    const idleLease = await factory();
    const activeLease = await factory();
    idleLease.terminate();
    factory.dispose();
    // A handle disposed after the pool shut down — the unmount ordering —
    // must kill its worker, not park it where nothing will ever lease it.
    activeLease.terminate();

    expect(doubles).toHaveLength(2);
    expect(doubles.every((double) => double.wasTerminated())).toBe(true);
  });

  it("dispose kills a worker whose reset ack arrives afterwards", async () => {
    const { factory, doubles } = trackingFactory({ autoAck: false });

    (await factory()).terminate();
    factory.dispose();
    doubles[0]!.emit({ type: "cancelled" });

    expect(doubles[0]!.wasTerminated()).toBe(true);
    // The late ack must not resurrect it into the pool.
    const next = await factory();
    expect(doubles).toHaveLength(2);
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
