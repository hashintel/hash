import { describe, expect, it } from "vitest";

import { JobScheduler, TickScheduler } from "./schedulers";

/** Let already-queued MessageChannel macro tasks drain. */
const settle = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 20);
  });

describe("TickScheduler", () => {
  it("ticks repeatedly until stopped from inside the tick, then stays stopped", async () => {
    let ticks = 0;
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const scheduler: TickScheduler = new TickScheduler(() => {
      ticks += 1;
      if (ticks === 3) {
        scheduler.stop();
        resolveDone();
      }
    });

    expect(scheduler.running).toBe(false);
    scheduler.ensureRunning();
    expect(scheduler.running).toBe(true);

    await done;
    await settle();

    expect(ticks).toBe(3);
    expect(scheduler.running).toBe(false);
  });

  it("does not double-schedule when ensureRunning is called while running", async () => {
    let ticks = 0;
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const scheduler: TickScheduler = new TickScheduler(() => {
      ticks += 1;
      // Re-entrant ensureRunning while running must be a no-op.
      scheduler.ensureRunning();
      if (ticks === 2) {
        scheduler.stop();
        resolveDone();
      }
    });

    scheduler.ensureRunning();
    scheduler.ensureRunning();

    await done;
    await settle();

    // A duplicated schedule would deliver extra queued ticks after stop.
    expect(ticks).toBe(2);
  });

  it("can be restarted after stopping", async () => {
    let ticks = 0;
    let resolveRun!: () => void;

    const scheduler: TickScheduler = new TickScheduler(() => {
      ticks += 1;
      scheduler.stop();
      resolveRun();
    });

    const firstRun = new Promise<void>((resolve) => {
      resolveRun = resolve;
    });
    scheduler.ensureRunning();
    await firstRun;

    const secondRun = new Promise<void>((resolve) => {
      resolveRun = resolve;
    });
    scheduler.ensureRunning();
    await secondRun;

    expect(ticks).toBe(2);
  });
});

describe("JobScheduler", () => {
  it("runs jobs asynchronously in FIFO order", async () => {
    const scheduler = new JobScheduler();
    const order: number[] = [];
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    scheduler.schedule(() => order.push(1));
    scheduler.schedule(() => order.push(2));
    scheduler.schedule(() => {
      order.push(3);
      resolveDone();
    });

    // Nothing runs synchronously on schedule().
    expect(order).toEqual([]);

    await done;
    expect(order).toEqual([1, 2, 3]);
  });

  it("runs jobs scheduled from inside a job after the current queue", async () => {
    const scheduler = new JobScheduler();
    const order: string[] = [];
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    scheduler.schedule(() => {
      order.push("first");
      scheduler.schedule(() => {
        order.push("nested");
        resolveDone();
      });
    });
    scheduler.schedule(() => order.push("second"));

    await done;
    expect(order).toEqual(["first", "second", "nested"]);
  });
});
