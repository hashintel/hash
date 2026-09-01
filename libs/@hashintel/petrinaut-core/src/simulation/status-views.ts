/**
 * @layerRoot core.simulation.status-views
 * @role Derives per-instance status and time-in-state from execution frames
 */

import type { ID, StatusLabel, StatusView } from "../types/sdcpn";
import type { SimulationFrameReader } from "./api";
import type {
  InstanceKey,
  StatusViewInstanceAssignment,
} from "./frames/hir-status-view";

/**
 * One stay of an instance in a label. Loops make time-in-state
 * multi-interval — a ticket can enter In Review several times — so displays
 * show the sum plus the entry count.
 */
export type StatusInterval = {
  labelId: ID;
  fromMs: number;
  /** null while the instance is still in the label. */
  toMs: number | null;
};

export type InstanceStatus = {
  /** Canonical string encoding of the instance's key tuple. */
  key: InstanceKey;
  /** Key element values in key order, in at-rest string form (raw display). */
  keyValues: string[];
  /** null when no label matches; the exit label counts as a label. */
  currentLabelId: ID | null;
  enteredCurrentAtMs: number;
  intervals: StatusInterval[];
};

export type StatusLabelDwell = {
  /** Total time the instance has spent in the label across every stay. */
  totalMs: number;
  entryCount: number;
};

export const getStatusViewExitLabel = (
  statusView: StatusView,
): StatusLabel | undefined => statusView.labels.find((label) => label.isExit);

/**
 * Sums an instance's stays in one label. Open intervals extend to `nowMs`.
 */
export const summarizeStatusIntervals = (
  intervals: readonly StatusInterval[],
  labelId: ID,
  nowMs: number,
): StatusLabelDwell => {
  let totalMs = 0;
  let entryCount = 0;
  for (const interval of intervals) {
    if (interval.labelId !== labelId) {
      continue;
    }
    entryCount += 1;
    totalMs += Math.max(0, (interval.toMs ?? nowMs) - interval.fromMs);
  }
  return { totalMs, entryCount };
};

type TrackedInstance = {
  keyValues: string[];
  currentLabelId: ID | null;
  enteredCurrentAtMs: number;
  intervals: StatusInterval[];
};

export type StatusViewTracker = {
  /** Feed frames in order; each frame's time closes and opens intervals. */
  observeFrame(frame: SimulationFrameReader): void;
  /** The time of the last observed frame, in ms (0 before any frame). */
  readonly lastObservedTimeMs: () => number;
  getInstanceStatuses(): InstanceStatus[];
};

/**
 * Walks frames and turns per-frame label assignments into per-instance
 * interval sets: status-change history and time-in-state, derived — never
 * stored. An instance whose token has left every place of the view falls to
 * the view's exit label when it declares one, and to no label otherwise.
 */
export function createStatusViewTracker(args: {
  statusView: StatusView;
  /** Per-frame assignment, from `createStatusViewFrameEvaluator`. */
  evaluateFrame: (
    frame: SimulationFrameReader,
  ) => Map<InstanceKey, StatusViewInstanceAssignment>;
}): StatusViewTracker {
  const { statusView, evaluateFrame } = args;
  const exitLabelId = getStatusViewExitLabel(statusView)?.id ?? null;
  const instances = new Map<InstanceKey, TrackedInstance>();
  let lastTimeMs = 0;

  const transitionTo = (
    key: InstanceKey,
    labelId: ID | null,
    timeMs: number,
  ): void => {
    const instance = instances.get(key);
    if (!instance || instance.currentLabelId === labelId) {
      return;
    }
    const openInterval = instance.intervals.at(-1);
    if (openInterval && openInterval.toMs === null) {
      openInterval.toMs = timeMs;
    }
    instance.currentLabelId = labelId;
    instance.enteredCurrentAtMs = timeMs;
    if (labelId !== null) {
      instance.intervals.push({ labelId, fromMs: timeMs, toMs: null });
    }
  };

  return {
    observeFrame(frame) {
      const timeMs = frame.time * 1_000;
      lastTimeMs = timeMs;
      const assignments = evaluateFrame(frame);

      for (const [key, assignment] of assignments) {
        if (!instances.has(key)) {
          instances.set(key, {
            keyValues: assignment.keyValues,
            currentLabelId: assignment.labelId,
            enteredCurrentAtMs: timeMs,
            intervals: [
              { labelId: assignment.labelId, fromMs: timeMs, toMs: null },
            ],
          });
          continue;
        }
        transitionTo(key, assignment.labelId, timeMs);
      }

      for (const key of instances.keys()) {
        if (!assignments.has(key)) {
          transitionTo(key, exitLabelId, timeMs);
        }
      }
    },
    lastObservedTimeMs: () => lastTimeMs,
    getInstanceStatuses() {
      return [...instances.entries()].map(([key, instance]) => ({
        key,
        keyValues: [...instance.keyValues],
        currentLabelId: instance.currentLabelId,
        enteredCurrentAtMs: instance.enteredCurrentAtMs,
        intervals: instance.intervals.map((interval) => ({ ...interval })),
      }));
    },
  };
}
