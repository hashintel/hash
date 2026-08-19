import { describe, expect, it } from "vitest";

import { createSerialQueue } from "./serial-queue";

/**
 * A promise which only settles when the test says so, standing in for an update
 * which is waiting on the network.
 */
const createGate = () => {
  let open!: () => void;

  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });

  return { promise, open };
};

describe("createSerialQueue", () => {
  it("does not start a task while an earlier one is running", async () => {
    const queue = createSerialQueue();
    const firstGate = createGate();
    const started: string[] = [];

    const firstRun = queue.enqueue(async () => {
      started.push("first");
      await firstGate.promise;
    });
    const secondRun = queue.enqueue(() => {
      started.push("second");

      return Promise.resolve();
    });

    await Promise.resolve();
    expect(started).toStrictEqual(["first"]);

    firstGate.open();
    await Promise.all([firstRun, secondRun]);

    expect(started).toStrictEqual(["first", "second"]);
  });

  it("runs a task when its turn comes, not when it is enqueued", async () => {
    const queue = createSerialQueue();
    const firstGate = createGate();

    // Stands in for state which the first task changes - the second task must
    // see the change, which it only can if it reads it when its turn comes.
    let state = "before";

    const firstRun = queue.enqueue(async () => {
      await firstGate.promise;
      state = "after";
    });
    const secondRun = queue.enqueue(() => Promise.resolve(state));

    firstGate.open();
    await firstRun;

    await expect(secondRun).resolves.toBe("after");
  });

  it("keeps running later tasks when a task fails", async () => {
    const queue = createSerialQueue();

    const failure = new Error("update failed");
    const failingRun = queue.enqueue(() => Promise.reject(failure));
    const laterRun = queue.enqueue(() => Promise.resolve("ran anyway"));

    // The rejection is delivered to the caller of the task which failed, and to
    // nobody else.
    await expect(failingRun).rejects.toBe(failure);
    await expect(laterRun).resolves.toBe("ran anyway");
  });

  it("resolves tasks in the order they were enqueued", async () => {
    const queue = createSerialQueue();
    const finished: number[] = [];

    await Promise.all(
      [0, 1, 2, 3].map((index) =>
        queue.enqueue(async () => {
          // A later task would finish sooner, but still waits its turn.
          await new Promise((resolve) => {
            setTimeout(resolve, 4 - index);
          });

          finished.push(index);
        }),
      ),
    );

    expect(finished).toStrictEqual([0, 1, 2, 3]);
  });
});
