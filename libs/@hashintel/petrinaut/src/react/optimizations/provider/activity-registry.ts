import { createThrottle } from "../../experiments/shared/throttle";

import type { OptimizationBatchStatus } from "../context";
import type {
  MonteCarloWorkerProgress,
  ReadableStore,
} from "@hashintel/petrinaut-core";

export type ActivityRegistry = {
  /** Lists the batch until the returned function is called. */
  register: (batch: {
    kind: OptimizationBatchStatus["kind"];
    label: string;
    runCount: number;
    progress: ReadableStore<MonteCarloWorkerProgress | null>;
  }) => () => void;
  /** Drops every batch and publishes the empty list. */
  clear: () => void;
};

const KIND_ORDER: Record<OptimizationBatchStatus["kind"], number> = {
  step: 0,
  refine: 1,
};

/**
 * Progress ticks republish on a 100 ms throttle: the list feeds a small
 * activity display, not the charts.
 */
const PROGRESS_TICK_MS = 100;

/**
 * Tracks every batch a connected study computes and publishes the sorted
 * list on each change — steps first, then refinement, each in the order it
 * began. A batch appearing or leaving publishes at once; its progress ticks
 * are throttled.
 */
export const createActivityRegistry = (
  onActivity: (activity: readonly OptimizationBatchStatus[]) => void,
): ActivityRegistry => {
  let sequence = 0;
  const active = new Map<
    number,
    {
      kind: OptimizationBatchStatus["kind"];
      label: string;
      runCount: number;
      progress: ReadableStore<MonteCarloWorkerProgress | null>;
      offProgress: () => void;
    }
  >();

  const publish = () => {
    onActivity(
      [...active.entries()]
        .map(([sequenceNumber, batch]) => ({
          id: `${batch.kind}-${sequenceNumber}`,
          kind: batch.kind,
          label: batch.label,
          runCount: batch.runCount,
          completedRuns: batch.progress.get()?.completedRuns ?? 0,
          sequenceNumber,
        }))
        .sort(
          (left, right) =>
            KIND_ORDER[left.kind] - KIND_ORDER[right.kind] ||
            left.sequenceNumber - right.sequenceNumber,
        )
        .map(({ sequenceNumber: _sequenceNumber, ...batch }) => batch),
    );
  };
  const progressTick = createThrottle(publish, PROGRESS_TICK_MS);

  return {
    register: ({ kind, label, runCount, progress }) => {
      const id = ++sequence;
      const offProgress = progress.subscribe(progressTick.call);
      active.set(id, { kind, label, runCount, progress, offProgress });
      publish();
      return () => {
        const batch = active.get(id);
        if (batch === undefined) {
          return;
        }
        active.delete(id);
        batch.offProgress();
        publish();
      };
    },
    clear: () => {
      for (const batch of active.values()) {
        batch.offProgress();
      }
      active.clear();
      progressTick.cancel();
      publish();
    },
  };
};
