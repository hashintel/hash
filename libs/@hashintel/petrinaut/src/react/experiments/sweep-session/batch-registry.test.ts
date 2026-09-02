import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBatchRegistry } from "./batch-registry";

import type { MonteCarloExperiment } from "@hashintel/petrinaut-core";

/** A handle whose only live part is its progress store. */
const fakeHandle = () => {
  const listeners = new Set<() => void>();
  let completedRuns = 0;
  const handle = {
    progress: {
      get: () => ({ completedRuns }),
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  } as unknown as MonteCarloExperiment;
  return {
    handle,
    listenerCount: () => listeners.size,
    tick: (runs: number) => {
      completedRuns = runs;
      for (const listener of listeners) {
        listener();
      }
    },
  };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createBatchRegistry", () => {
  it("publishes on register and unregister, and throttles progress ticks", () => {
    const published: number[][] = [];
    const registry = createBatchRegistry((batches) => {
      published.push(batches.map((batch) => batch.completedRuns));
    });
    const first = fakeHandle();
    const unregister = registry.register("surface", 8, first.handle);
    expect(published).toEqual([[0]]);

    first.tick(3);
    expect(published).toEqual([[0], [3]]);
    first.tick(5);
    vi.advanceTimersByTime(100);
    expect(published).toEqual([[0], [3], [5]]);

    unregister();
    expect(published.at(-1)).toEqual([]);
    expect(first.listenerCount()).toBe(0);
  });

  it("stops listening to every handle on clear, so later ticks publish nothing", () => {
    const published: number[][] = [];
    const registry = createBatchRegistry((batches) => {
      published.push(batches.map((batch) => batch.completedRuns));
    });
    const first = fakeHandle();
    const second = fakeHandle();
    registry.register("selection", 100, first.handle);
    const unregisterSecond = registry.register("refine", 8, second.handle);

    registry.clear();
    expect(published.at(-1)).toEqual([]);
    expect(first.listenerCount()).toBe(0);
    expect(second.listenerCount()).toBe(0);

    const publishedAfterClear = published.length;
    first.tick(50);
    second.tick(4);
    vi.advanceTimersByTime(500);
    unregisterSecond();
    expect(published.length).toBe(publishedAfterClear);
  });
});
