/**
 * The drawer's summary: a strip of stats with a status dot, the compute
 * activity underneath, and the error text when the experiment failed.
 */
import { useEffect, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import {
  type ExperimentRecord,
  getExperimentElapsedMs,
  isExperimentActive,
  type SweepBatchStatus,
} from "../../../../../../../react/experiments/context";
import { experimentProgressPercent } from "../../../../shared/experiment-progress";
import {
  ComputeActivity,
  type ComputeActivityBatch,
} from "../../shared/compute-activity";
import {
  SummaryStat,
  SummaryStatusDot,
  type SummaryStatusTone,
  SummaryStrip,
} from "../../shared/summary-strip";
import { formatDurationMs } from "../format-duration";
import { formatNumber } from "../shared/format-number";

const summaryStyle = css({
  marginTop: "-1",
  marginBottom: "3",
});

const activityStyle = css({
  marginTop: "2",
});

const errorStyle = css({
  fontSize: "sm",
  color: "red.s100",
  whiteSpace: "pre-wrap",
});

const STATUS_DISPLAY: Record<
  ExperimentRecord["status"],
  { label: string; tone: SummaryStatusTone }
> = {
  initializing: { label: "Initializing", tone: "active" },
  running: { label: "Running", tone: "active" },
  idle: { label: "Idle", tone: "neutral" },
  complete: { label: "Complete", tone: "done" },
  error: { label: "Error", tone: "error" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

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

/** Longest status label, so the strip never reflows as the status changes. */
/**
 * Simulated time to show when no batch is publishing progress: an idle sweep
 * or a complete run has taken every run to the end.
 */
const settledTime = (experiment: ExperimentRecord): number =>
  experiment.status === "idle" || experiment.status === "complete"
    ? experiment.maxTime
    : 0;

const STATUS_CHARS =
  Math.max(
    ...Object.values(STATUS_DISPLAY).map((entry) => entry.label.length),
  ) + 2;

/**
 * "selection" is the navigator's own ladder — the priority work; "surface"
 * is a contour chunk; "refine" is a single cell brought up to depth.
 */
const BATCH_KIND_META: Record<
  SweepBatchStatus["kind"],
  Pick<ComputeActivityBatch, "label" | "tone">
> = {
  selection: { label: "Selection", tone: "priority" },
  surface: { label: "Surface", tone: "background" },
  refine: { label: "Refine", tone: "background" },
};

/** The sweep's batches as the activity list shows them. */
const activityBatches = (
  sweepBatches: readonly SweepBatchStatus[],
): ComputeActivityBatch[] =>
  sweepBatches.map((batch) => ({
    id: String(batch.id),
    ...BATCH_KIND_META[batch.kind],
    runCount: batch.runCount,
    completedRuns: batch.completedRuns,
  }));

/** The bar under the stats: the selection's runs for a sweep, simulated time otherwise. */
const activityBar = (experiment: ExperimentRecord) => ({
  percent: experimentProgressPercent(experiment),
  label: experiment.sweep
    ? `Selection · ${experiment.sweep.runsSampled.toLocaleString("en-US")} / ${experiment.runCount.toLocaleString("en-US")} runs`
    : `Time · ${(experiment.progress?.time ?? 0).toLocaleString("en-US")} / ${experiment.maxTime.toLocaleString("en-US")}`,
});

export const ExperimentSummary = ({
  experiment,
}: {
  experiment: ExperimentRecord;
}) => {
  const progress = experiment.progress;
  const now = useNow(isExperimentActive(experiment));
  const elapsedMs = getExperimentElapsedMs(experiment, now);
  const status = STATUS_DISPLAY[experiment.status];

  return (
    <div className={summaryStyle}>
      <SummaryStrip>
        <SummaryStat label="Status" minChars={STATUS_CHARS}>
          <SummaryStatusDot tone={status.tone} />
          {status.label}
        </SummaryStat>
        <SummaryStat label="Scenario">
          {experiment.scenarioName ?? "Default"}
        </SummaryStat>
        <SummaryStat
          label="Runs"
          minChars={
            `${experiment.runCount} active, ${experiment.runCount} complete`
              .length
          }
        >
          {progress
            ? `${progress.activeRuns} active, ${progress.completedRuns} complete`
            : experiment.runCount}
        </SummaryStat>
        <SummaryStat
          label="Errors"
          minChars={String(experiment.runCount).length}
        >
          {progress?.erroredRuns ?? 0}
        </SummaryStat>
        <SummaryStat
          label="Time"
          minChars={
            `${formatNumber(experiment.maxTime)} / ${formatNumber(experiment.maxTime)}`
              .length
          }
        >
          {formatNumber(progress?.time ?? settledTime(experiment))} /{" "}
          {formatNumber(experiment.maxTime)}
        </SummaryStat>
        {/* Wall-clock, as distinct from the simulated time; dashed out
              when stepping never began. */}
        <SummaryStat
          label={experiment.finishedAt === null ? "Elapsed" : "Duration"}
          minChars={8}
        >
          {elapsedMs === null ? "—" : formatDurationMs(elapsedMs)}
        </SummaryStat>
      </SummaryStrip>
      <div className={activityStyle}>
        <ComputeActivity
          bar={activityBar(experiment)}
          batches={activityBatches(experiment.sweepBatches)}
        />
      </div>
      {experiment.error ? (
        <span className={errorStyle}>{experiment.error}</span>
      ) : null}
    </div>
  );
};
