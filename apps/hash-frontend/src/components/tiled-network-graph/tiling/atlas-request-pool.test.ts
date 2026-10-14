import { afterEach, describe, expect, it, vi } from "vitest";

import { noteAtlasBudget, resetAtlasBackpressure } from "./atlas-backpressure";
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
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
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
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
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
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

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

  describe("budget pacing", () => {
    afterEach(() => {
      vi.useRealTimers();
      resetAtlasBackpressure();
    });

    it("holds dispatch while the reported budget is dry, releasing on refill", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      // One token at ten per second: the second dispatch waits ~100ms.
      noteAtlasBudget('"gate";q=10;w=1', '"gate";r=1');
      const pool = createAtlasRequestPool(2);
      const operation = vi.fn(() => Promise.resolve("ok"));

      const first = pool.run("required", operation);
      const second = pool.run("required", operation);
      await vi.advanceTimersByTimeAsync(0);
      expect(operation).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(100);
      expect(operation).toHaveBeenCalledTimes(2);
      await expect(Promise.all([first, second])).resolves.toEqual(["ok", "ok"]);
    });

    it("rejects an abort during the paced wait without dispatching", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      noteAtlasBudget('"gate";q=10;w=1', '"gate";r=0');
      const pool = createAtlasRequestPool(1);
      const operation = vi.fn(() => Promise.resolve("never"));
      const controller = new AbortController();

      const paced = pool.run("speculative", operation, controller.signal);
      await vi.advanceTimersByTimeAsync(0);
      controller.abort(new Error("superseded"));

      await expect(paced).rejects.toThrow("superseded");
      expect(operation).not.toHaveBeenCalled();
    });

    it("does not pace when no budget was ever reported", async () => {
      const pool = createAtlasRequestPool(1);
      await expect(
        pool.run("required", () => Promise.resolve("ok")),
      ).resolves.toBe("ok");
    });
  });
});
