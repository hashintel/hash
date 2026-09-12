/**
 * The experiment frame's stat columns: the status pill, the runs, the errors,
 * the simulated time, the wall-clock time, the selection's sampling for a
 * sweep, and the chip listing what computes. Every column is as wide as its
 * widest value.
 */
import { useEffect, useState } from "react";

import {
  type ExperimentRecord,
  getExperimentElapsedMs,
  isExperimentActive,
  type SweepBatchStatus,
} from "../../../../../../../react/experiments/context";
import {
  type ComputeBatch,
  ComputeBatchesChip,
  FrameStat,
  FrameStatusPill,
  type FrameStatusTone,
} from "../../shared/drawer-frame";
import { formatFixed } from "../../shared/format-value";
import { formatDurationMs } from "../format-duration";

const STATUS_DISPLAY: Record<
  ExperimentRecord["status"],
  { label: string; tone: FrameStatusTone }
> = {
  initializing: { label: "Initializing", tone: "active" },
  running: { label: "Running", tone: "active" },
  idle: { label: "Idle", tone: "neutral" },
  complete: { label: "Complete", tone: "done" },
  error: { label: "Error", tone: "error" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/** The longest status label, so the pill keeps its width as the status changes. */
const WIDEST_STATUS = Object.values(STATUS_DISPLAY)
  .map((entry) => entry.label)
  .reduce((widest, label) => (label.length > widest.length ? label : widest));

/** The widest wall-clock readout `formatDurationMs` prints. */
const WIDEST_DURATION = "59m 59s";

/**
 * A clock that advances while `active`, so an elapsed-time readout keeps
 * moving even when a stalled run stops publishing progress.
 */
const useNow = (active: boolean): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return;
    }
    const update = () => setNow(Date.now());
    update();
    const intervalId = window.setInterval(update, 250);
    return () => window.clearInterval(intervalId);
  }, [active]);

  return now;
};

/**
 * Simulated time to show when no batch is publishing progress: an idle sweep
 * or a complete run has taken every run to the end.
 */
const settledTime = (experiment: ExperimentRecord): number =>
  experiment.status === "idle" || experiment.status === "complete"
    ? experiment.maxTime
    : 0;

/**
 * "selection" is the navigator's own ladder, the priority work; "surface"
 * is a contour chunk; "refine" is a single cell brought up to depth.
 */
const BATCH_KIND_META: Record<
  SweepBatchStatus["kind"],
  Pick<ComputeBatch, "label" | "tone">
> = {
  selection: { label: "Selection", tone: "priority" },
  surface: { label: "Surface", tone: "background" },
  refine: { label: "Refine", tone: "background" },
};

/** The sweep's batches as the computing list shows them. */
export const experimentComputeBatches = (
  sweepBatches: readonly SweepBatchStatus[],
): ComputeBatch[] =>
  sweepBatches.map((batch) => ({
    id: String(batch.id),
    ...BATCH_KIND_META[batch.kind],
    runCount: batch.runCount,
    completedRuns: batch.completedRuns,
  }));

const formatCount = (value: number): string => value.toLocaleString("en-US");

export const ExperimentStats = ({
  experiment,
}: {
  experiment: ExperimentRecord;
}) => {
  const progress = experiment.progress;
  const now = useNow(isExperimentActive(experiment));
  const elapsedMs = getExperimentElapsedMs(experiment, now);
  const status = STATUS_DISPLAY[experiment.status];
  const runCount = formatCount(experiment.runCount);
  const maxTime = formatFixed(experiment.maxTime);
  // The widest time readout: a fraction just under the maximum, which prints
  // its three decimals, over the maximum.
  const widestTime = `${formatFixed(Math.max(0, experiment.maxTime - 0.001))} / ${maxTime}`;

  return (
    <>
      <FrameStat label="Status" widest="" align="start">
        <FrameStatusPill tone={status.tone} widest={WIDEST_STATUS}>
          {status.label}
        </FrameStatusPill>
      </FrameStat>
      <FrameStat
        label="Runs"
        widest={`${runCount} active, ${runCount} complete`}
      >
        {progress
          ? `${formatCount(progress.activeRuns)} active, ${formatCount(progress.completedRuns)} complete`
          : runCount}
      </FrameStat>
      <FrameStat label="Errors" widest={runCount}>
        {formatCount(progress?.erroredRuns ?? 0)}
      </FrameStat>
      <FrameStat label="Time" widest={widestTime}>
        {formatFixed(progress?.time ?? settledTime(experiment))} / {maxTime}
      </FrameStat>
      {/* Wall-clock, as distinct from the simulated time; it stops once the
          experiment finishes and is dashed out when stepping never began. */}
      <FrameStat label="Elapsed" widest={WIDEST_DURATION}>
        {elapsedMs === null ? "—" : formatDurationMs(elapsedMs)}
      </FrameStat>
      {experiment.sweep ? (
        <FrameStat label="Selection" widest={`${runCount} / ${runCount} runs`}>
          {formatCount(experiment.sweep.runsSampled)} / {runCount} runs
        </FrameStat>
      ) : null}
      <FrameStat label="Activity" widest="" align="start">
        <ComputeBatchesChip
          batches={experimentComputeBatches(experiment.sweepBatches)}
        />
      </FrameStat>
    </>
  );
};
