import { describe, expect, it, vi } from "vitest";

import { createAtlasRequestPool } from "./atlas-request-pool";

/** A promise with its settle handles exposed. */
const deferred = <T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

describe("createAtlasRequestPool", () => {
  it("caps concurrent operations at the limit and admits queued ones as slots free", async () => {
    const pool = createAtlasRequestPool(2);
    const gate = deferred<void>();
    let running = 0;
    let peak = 0;
    const operation = async (): Promise<void> => {
      running += 1;
      peak = Math.max(peak, running);
      await gate.promise;
      running -= 1;
    };

    const runs = [
      pool.run("required", operation),
      pool.run("required", operation),
      pool.run("required", operation),
    ];
    await Promise.resolve();
    expect(peak).toBe(2);

    gate.resolve();
    await Promise.all(runs);
    expect(peak).toBe(2);
    expect(running).toBe(0);
  });

  it("starts a queued required operation before an earlier-queued speculative one", async () => {
    const pool = createAtlasRequestPool(1);
    const gate = deferred<void>();
    const order: string[] = [];

    const occupant = pool.run("required", () => gate.promise);
    await Promise.resolve();
    const speculative = pool.run("speculative", () => {
      order.push("speculative");
      return Promise.resolve();
    });
    const required = pool.run("required", () => {
      order.push("required");
      return Promise.resolve();
    });

    gate.resolve();
    await Promise.all([occupant, speculative, required]);
    expect(order).toEqual(["required", "speculative"]);
  });

  it("rejects a queued operation on abort without ever starting it", async () => {
    const pool = createAtlasRequestPool(1);
    const gate = deferred<void>();
    const occupant = pool.run("required", () => gate.promise);
    await Promise.resolve();

    const controller = new AbortController();
    const operation = vi.fn(() => Promise.resolve("never"));
    const queued = pool.run("speculative", operation, controller.signal);
    controller.abort(new Error("superseded"));

    await expect(queued).rejects.toThrow("superseded");
    expect(operation).not.toHaveBeenCalled();

    // The freed slot admits later work rather than the aborted husk.
    gate.resolve();
    await occupant;
    await expect(
      pool.run("speculative", () => Promise.resolve("next")),
    ).resolves.toBe("next");
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const pool = createAtlasRequestPool(1);
    const controller = new AbortController();
    controller.abort(new Error("gone"));
    const operation = vi.fn(() => Promise.resolve("never"));

    await expect(
      pool.run("required", operation, controller.signal),
    ).rejects.toThrow("gone");
    expect(operation).not.toHaveBeenCalled();
  });

  it("frees the slot when an operation rejects", async () => {
    const pool = createAtlasRequestPool(1);

    await expect(
      pool.run("required", () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    await expect(
      pool.run("required", () => Promise.resolve("ok")),
    ).resolves.toBe("ok");
  });
});
