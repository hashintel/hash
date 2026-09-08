import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createReadableStore } from "@hashintel/petrinaut-core";

import { createBatchRegistry } from "./batch-registry";

import type { MonteCarloWorkerProgress } from "@hashintel/petrinaut-core";

type Batch =
  | { kind: "selection" }
  | { kind: "refine"; label: string }
  | { kind: "surface" };

/** A progress store the test ticks by hand, counting its listeners. */
const fakeProgress = () => {
  const store = createReadableStore<MonteCarloWorkerProgress | null>(null);
  let listeners = 0;
  return {
    progress: {
      get: () => store.get(),
      subscribe: (
        listener: (value: MonteCarloWorkerProgress | null) => void,
      ) => {
        listeners += 1;
        const off = store.subscribe(listener);
        return () => {
          listeners -= 1;
          off();
        };
      },
    },
    listenerCount: () => listeners,
    tick: (completedRuns: number) => {
      store.set({ completedRuns } as MonteCarloWorkerProgress);
    },
  };
};

const setup = () => {
  const published: (readonly { kind: string; completedRuns: number }[])[] = [];
  let latest: readonly Record<string, unknown>[] = [];
  const registry = createBatchRegistry<Batch["kind"], Batch>({
    kindOrder: ["selection", "surface", "refine"],
    onPublish: (batches) => {
      published.push(batches);
      latest = batches;
    },
  });
  return { registry, published, latest: () => latest };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createBatchRegistry", () => {
  it("publishes on register and unregister, and throttles progress ticks", () => {
    const { registry, published } = setup();
    const completed = () =>
      published.map((batches) => batches.map((batch) => batch.completedRuns));
    const first = fakeProgress();
    const unregister = registry.register(
      { kind: "surface" },
      8,
      first.progress,
    );
    expect(completed()).toEqual([[0]]);

    first.tick(3);
    expect(completed()).toEqual([[0], [3]]);
    first.tick(5);
    vi.advanceTimersByTime(100);
    expect(completed()).toEqual([[0], [3], [5]]);

    unregister();
    expect(published.at(-1)).toEqual([]);
    expect(first.listenerCount()).toBe(0);
  });

  it("sorts kinds in the given order, each kind in registration order, carrying each batch's own fields", () => {
    const { registry, latest } = setup();
    registry.register(
      { kind: "refine", label: "Refining" },
      17,
      fakeProgress().progress,
    );
    registry.register({ kind: "selection" }, 3, fakeProgress().progress);
    registry.register({ kind: "selection" }, 3, fakeProgress().progress);

    expect(latest()).toEqual([
      { id: 2, kind: "selection", runCount: 3, completedRuns: 0 },
      { id: 3, kind: "selection", runCount: 3, completedRuns: 0 },
      {
        id: 1,
        kind: "refine",
        label: "Refining",
        runCount: 17,
        completedRuns: 0,
      },
    ]);
  });

  it("stops listening to every batch on clear, so later ticks publish nothing", () => {
    const { registry, published } = setup();
    const first = fakeProgress();
    const second = fakeProgress();
    registry.register({ kind: "selection" }, 100, first.progress);
    const unregisterSecond = registry.register(
      { kind: "refine", label: "Refining" },
      8,
      second.progress,
    );

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
