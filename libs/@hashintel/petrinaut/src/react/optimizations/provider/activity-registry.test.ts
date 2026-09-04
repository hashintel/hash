import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createActivityRegistry } from "./activity-registry";

import type { OptimizationBatchStatus } from "../context";
import type {
  MonteCarloWorkerProgress,
  ReadableStore,
} from "@hashintel/petrinaut-core";

/** A progress store the test ticks by hand. */
const fakeProgress = () => {
  const listeners = new Set<(value: MonteCarloWorkerProgress | null) => void>();
  let completedRuns = 0;
  const progress: ReadableStore<MonteCarloWorkerProgress | null> = {
    get: () => ({ completedRuns }) as MonteCarloWorkerProgress,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    progress,
    listenerCount: () => listeners.size,
    tick: (runs: number) => {
      completedRuns = runs;
      for (const listener of listeners) {
        listener(progress.get());
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

describe("createActivityRegistry", () => {
  it("publishes on register and unregister, and throttles progress ticks", () => {
    const published: number[][] = [];
    const registry = createActivityRegistry((activity) => {
      published.push(activity.map((batch) => batch.completedRuns));
    });
    const step = fakeProgress();
    const unregister = registry.register({
      kind: "step",
      label: "Step 1",
      runCount: 8,
      progress: step.progress,
    });
    expect(published).toEqual([[0]]);

    step.tick(3);
    expect(published).toEqual([[0], [3]]);
    step.tick(5);
    vi.advanceTimersByTime(100);
    expect(published).toEqual([[0], [3], [5]]);

    unregister();
    expect(published.at(-1)).toEqual([]);
    expect(step.listenerCount()).toBe(0);
  });

  it("lists steps before refinement, each in the order it began, with its label and budget", () => {
    let latest: readonly OptimizationBatchStatus[] = [];
    const registry = createActivityRegistry((activity) => {
      latest = activity;
    });
    registry.register({
      kind: "refine",
      label: "Refining infected_ratio 0.05",
      runCount: 17,
      progress: fakeProgress().progress,
    });
    registry.register({
      kind: "step",
      label: "Step 3",
      runCount: 3,
      progress: fakeProgress().progress,
    });
    registry.register({
      kind: "step",
      label: "Step 4",
      runCount: 3,
      progress: fakeProgress().progress,
    });

    expect(latest).toEqual([
      {
        id: "step-2",
        kind: "step",
        label: "Step 3",
        runCount: 3,
        completedRuns: 0,
      },
      {
        id: "step-3",
        kind: "step",
        label: "Step 4",
        runCount: 3,
        completedRuns: 0,
      },
      {
        id: "refine-1",
        kind: "refine",
        label: "Refining infected_ratio 0.05",
        runCount: 17,
        completedRuns: 0,
      },
    ]);
  });

  it("stops listening to every batch on clear, so later ticks publish nothing", () => {
    const published: number[][] = [];
    const registry = createActivityRegistry((activity) => {
      published.push(activity.map((batch) => batch.completedRuns));
    });
    const step = fakeProgress();
    const rung = fakeProgress();
    registry.register({
      kind: "step",
      label: "Step 1",
      runCount: 3,
      progress: step.progress,
    });
    const unregisterRung = registry.register({
      kind: "refine",
      label: "Refining",
      runCount: 8,
      progress: rung.progress,
    });

    registry.clear();
    expect(published.at(-1)).toEqual([]);
    expect(step.listenerCount()).toBe(0);
    expect(rung.listenerCount()).toBe(0);

    const publishedAfterClear = published.length;
    step.tick(2);
    rung.tick(4);
    vi.advanceTimersByTime(500);
    unregisterRung();
    expect(published.length).toBe(publishedAfterClear);
  });
});
