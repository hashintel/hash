import { createThrottle } from "./throttle";

import type { MonteCarloExperiment } from "@hashintel/petrinaut-core";

/** One batch currently computing, for the host's activity display. */
export type SweepBatchStatus = {
  id: number;
  /**
   * "selection" is the navigator's own ladder — the priority work; "surface"
   * is a contour chunk; "refine" is a single cell brought up to depth.
   * Selection batches sort first.
   */
  kind: "selection" | "surface" | "refine";
  /** Runs this batch owns. */
  runCount: number;
  /** Runs it has finished so far. */
  completedRuns: number;
};

export type BatchRegistry = {
  /** Lists the batch until the returned function is called. */
  register: (
    kind: SweepBatchStatus["kind"],
    runCount: number,
    handle: MonteCarloExperiment,
  ) => () => void;
  /** Drops every batch and publishes the empty list. */
  clear: () => void;
};

const KIND_ORDER: Record<SweepBatchStatus["kind"], number> = {
  selection: 0,
  surface: 1,
  refine: 2,
};

/**
 * Progress ticks republish on a 100 ms throttle: the list feeds a small
 * activity display, not the charts.
 */
const PROGRESS_TICK_MS = 100;

/**
 * Tracks every computing batch and publishes the sorted list on each change.
 * A batch appearing or leaving publishes at once; its progress ticks are
 * throttled.
 */
export const createBatchRegistry = (
  onBatches: (batches: readonly SweepBatchStatus[]) => void,
): BatchRegistry => {
  let sequence = 0;
  const active = new Map<
    number,
    {
      kind: SweepBatchStatus["kind"];
      runCount: number;
      handle: MonteCarloExperiment;
      offProgress: () => void;
    }
  >();

  const publish = () => {
    onBatches(
      [...active.entries()]
        .map(([id, batch]) => ({
          id,
          kind: batch.kind,
          runCount: batch.runCount,
          completedRuns: batch.handle.progress.get()?.completedRuns ?? 0,
        }))
        .sort(
          (left, right) =>
            KIND_ORDER[left.kind] - KIND_ORDER[right.kind] ||
            left.id - right.id,
        ),
    );
  };
  const progressTick = createThrottle(publish, PROGRESS_TICK_MS);

  return {
    register: (kind, runCount, handle) => {
      const id = ++sequence;
      const offProgress = handle.progress.subscribe(progressTick.call);
      active.set(id, { kind, runCount, handle, offProgress });
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
    // Background batches keep running after the session is disposed; without
    // unsubscribing, their progress ticks would keep publishing to a host that
    // has already dropped the experiment.
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
