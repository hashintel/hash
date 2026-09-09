/**
 * The experiment frame's stats line: the status pill, the runs, the errors,
 * the simulated time, the wall-clock time, the selection's sampling for a
 * sweep, and the chip listing what computes. Every value reserves its width.
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

/** Longest status label plus the dot, so the pill keeps its width as the status changes. */
const STATUS_CHARS =
  Math.max(
    ...Object.values(STATUS_DISPLAY).map((entry) => entry.label.length),
  ) + 2;

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

  return (
    <>
      <FrameStatusPill tone={status.tone} minChars={STATUS_CHARS}>
        {status.label}
      </FrameStatusPill>
      <FrameStat
        label="Runs"
        minChars={`${runCount} active, ${runCount} complete`.length}
      >
        {progress
          ? `${formatCount(progress.activeRuns)} active, ${formatCount(progress.completedRuns)} complete`
          : runCount}
      </FrameStat>
      <FrameStat label="Errors" minChars={runCount.length}>
        {formatCount(progress?.erroredRuns ?? 0)}
      </FrameStat>
      <FrameStat
        label="Time"
        minChars={
          `${formatFixed(experiment.maxTime)} / ${formatFixed(experiment.maxTime)}`
            .length
        }
      >
        {formatFixed(progress?.time ?? settledTime(experiment))} /{" "}
        {formatFixed(experiment.maxTime)}
      </FrameStat>
      {/* Wall-clock, as distinct from the simulated time; dashed out when
          stepping never began. */}
      <FrameStat
        label={experiment.finishedAt === null ? "Elapsed" : "Duration"}
        minChars={8}
      >
        {elapsedMs === null ? "—" : formatDurationMs(elapsedMs)}
      </FrameStat>
      {experiment.sweep ? (
        <FrameStat
          label="Selection"
          minChars={`${runCount} / ${runCount} runs`.length}
        >
          {formatCount(experiment.sweep.runsSampled)} / {runCount} runs
        </FrameStat>
      ) : null}
      <ComputeBatchesChip
        batches={experimentComputeBatches(experiment.sweepBatches)}
      />
    </>
  );
};
