import { createThrottle } from "./throttle";

import type {
  MonteCarloWorkerProgress,
  ReadableStore,
} from "@hashintel/petrinaut-core";

/** A registered batch as the registry publishes it: its own fields, its identity and its progress. */
export type BatchStatus<Batch> = Batch & {
  /** Registration order, unique within a registry. */
  id: number;
  /** Runs this batch owns. */
  runCount: number;
  /** Runs it has finished so far. */
  completedRuns: number;
};

export type BatchRegistry<Batch> = {
  /** Lists the batch until the returned function is called. */
  register: (
    batch: Batch,
    runCount: number,
    progress: ReadableStore<MonteCarloWorkerProgress | null>,
  ) => () => void;
  /** Drops every batch and publishes the empty list. */
  clear: () => void;
};

/**
 * Progress ticks republish on a 100 ms throttle: the list feeds a small
 * activity display, not the charts.
 */
const PROGRESS_TICK_MS = 100;

/**
 * Tracks every computing batch and publishes the sorted list on each change:
 * kinds in `kindOrder`, each kind in the order its batches began. A batch
 * appearing or leaving publishes at once; its progress ticks are throttled.
 */
export const createBatchRegistry = <
  Kind extends string,
  Batch extends { kind: Kind },
>({
  kindOrder,
  onPublish,
}: {
  kindOrder: readonly Kind[];
  onPublish: (batches: readonly BatchStatus<Batch>[]) => void;
}): BatchRegistry<Batch> => {
  let sequence = 0;
  const active = new Map<
    number,
    {
      batch: Batch;
      runCount: number;
      progress: ReadableStore<MonteCarloWorkerProgress | null>;
      offProgress: () => void;
    }
  >();

  const publish = () => {
    onPublish(
      [...active.entries()]
        .map(([id, entry]) => ({
          ...entry.batch,
          id,
          runCount: entry.runCount,
          completedRuns: entry.progress.get()?.completedRuns ?? 0,
        }))
        .sort(
          (left, right) =>
            kindOrder.indexOf(left.kind) - kindOrder.indexOf(right.kind) ||
            left.id - right.id,
        ),
    );
  };
  const progressTick = createThrottle(publish, PROGRESS_TICK_MS);

  return {
    register: (batch, runCount, progress) => {
      const id = ++sequence;
      const offProgress = progress.subscribe(progressTick.call);
      active.set(id, { batch, runCount, progress, offProgress });
      publish();
      return () => {
        const entry = active.get(id);
        if (entry === undefined) {
          return;
        }
        active.delete(id);
        entry.offProgress();
        publish();
      };
    },
    // Background batches keep running after their owner is disposed; without
    // unsubscribing, their progress ticks would keep publishing to a host that
    // has already dropped the record.
    clear: () => {
      for (const entry of active.values()) {
        entry.offProgress();
      }
      active.clear();
      progressTick.cancel();
      publish();
    },
  };
};
