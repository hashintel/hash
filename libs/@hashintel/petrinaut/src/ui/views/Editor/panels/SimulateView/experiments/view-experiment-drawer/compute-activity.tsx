/**
 * The summary's compute readout: an overall progress bar plus a compact,
 * toggleable list of every batch computing right now.
 *
 * The single bar dates from one-simulation-at-a-time; a sweep now runs the
 * selection's ladder, surface chunks, and cell refinements in parallel. The
 * bar keeps meaning "the selected combination's progress" (runs sampled over
 * the run budget — the thing the charts show), and the list underneath shows
 * the parallelism: one row per live batch with its kind, priority, and its
 * own progress. Collapsed, it is one line ("N computing"); nothing renders
 * when nothing computes.
 */
import { useState } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type {
  ExperimentRecord,
  SweepBatchStatus,
} from "../../../../../../../react/experiments/context";

const barTrackStyle = css({
  height: "[6px]",
  width: "full",
  backgroundColor: "neutral.s30",
  borderRadius: "full",
  overflow: "hidden",
});

const barFillStyle = css({
  height: "full",
  borderRadius: "full",
  backgroundColor: "neutral.s120",
  transition: "[width 160ms ease-out]",
});

const metaRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  marginTop: "1",
  minHeight: "[20px]",
});

const metaLabelStyle = css({
  fontSize: "[11px]",
  color: "neutral.s80",
  fontVariantNumeric: "tabular-nums",
});

const toggleStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  paddingX: "1.5",
  paddingY: "[2px]",
  borderRadius: "sm",
  borderWidth: "[0]",
  fontSize: "[11px]",
  fontWeight: "medium",
  color: "neutral.s100",
  backgroundColor: "neutral.s10",
  cursor: "pointer",
  _hover: { backgroundColor: "neutral.s20" },
});

const computingDotStyle = css({
  width: "[6px]",
  height: "[6px]",
  borderRadius: "full",
  backgroundColor: "blue.s100",
});

const batchListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[3px]",
  marginTop: "1",
  padding: "1.5",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "sm",
  backgroundColor: "neutral.s10",
});

const batchRowStyle = css({
  display: "grid",
  gridTemplateColumns: "[76px minmax(0, 1fr) 88px]",
  alignItems: "center",
  gap: "2",
  minHeight: "[16px]",
});

const batchLabelStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  fontSize: "[11px]",
  color: "neutral.s100",
  whiteSpace: "nowrap",
});

const batchDotStyle = css({
  width: "[6px]",
  height: "[6px]",
  borderRadius: "full",
  flexShrink: "0",
  backgroundColor: "neutral.s60",
  "&[data-tone=priority]": { backgroundColor: "blue.s100" },
});

const batchTrackStyle = css({
  height: "[4px]",
  borderRadius: "full",
  backgroundColor: "neutral.s30",
  overflow: "hidden",
});

const batchFillStyle = css({
  height: "full",
  borderRadius: "full",
  backgroundColor: "neutral.s90",
  transition: "[width 160ms ease-out]",
  "&[data-tone=priority]": { backgroundColor: "blue.s100" },
});

const batchCountStyle = css({
  fontSize: "[11px]",
  color: "neutral.s80",
  fontVariantNumeric: "tabular-nums",
  textAlign: "right",
  whiteSpace: "nowrap",
});

const BATCH_KIND_META: Record<
  SweepBatchStatus["kind"],
  { label: string; tone: "priority" | "background" }
> = {
  selection: { label: "Selection", tone: "priority" },
  surface: { label: "Surface", tone: "background" },
  refine: { label: "Refine", tone: "background" },
};

const BatchRow = ({ batch }: { batch: SweepBatchStatus }) => {
  const meta = BATCH_KIND_META[batch.kind];
  const percent =
    batch.runCount > 0
      ? Math.min(100, (batch.completedRuns / batch.runCount) * 100)
      : 0;

  return (
    <div className={batchRowStyle}>
      <span className={batchLabelStyle}>
        <span className={batchDotStyle} data-tone={meta.tone} />
        {meta.label}
      </span>
      <div className={batchTrackStyle}>
        <div
          className={batchFillStyle}
          data-tone={meta.tone}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className={batchCountStyle}>
        {batch.completedRuns.toLocaleString("en-US")} /{" "}
        {batch.runCount.toLocaleString("en-US")} runs
      </span>
    </div>
  );
};

export const ComputeActivity = ({
  experiment,
}: {
  experiment: ExperimentRecord;
}) => {
  const [expanded, setExpanded] = useState(false);
  const batches = experiment.sweepBatches;
  const sweep = experiment.sweep;

  // The bar means "the selected combination's progress": runs sampled over
  // the budget for a sweep, simulated time for a plain experiment.
  const percent = sweep
    ? experiment.runCount > 0
      ? Math.min(100, (sweep.runsSampled / experiment.runCount) * 100)
      : 0
    : experiment.progress && experiment.maxTime > 0
      ? Math.min(100, (experiment.progress.time / experiment.maxTime) * 100)
      : 0;
  const barLabel = sweep
    ? `Selection · ${sweep.runsSampled.toLocaleString("en-US")} / ${experiment.runCount.toLocaleString("en-US")} runs`
    : `Time · ${(experiment.progress?.time ?? 0).toLocaleString("en-US")} / ${experiment.maxTime.toLocaleString("en-US")}`;

  return (
    <div>
      <div className={barTrackStyle}>
        <div className={barFillStyle} style={{ width: `${percent}%` }} />
      </div>
      <div className={metaRowStyle}>
        <span className={metaLabelStyle}>{barLabel}</span>
        {batches.length > 0 ? (
          <button
            type="button"
            className={toggleStyle}
            aria-expanded={expanded}
            onClick={() => setExpanded((previous) => !previous)}
          >
            <span className={computingDotStyle} />
            {batches.length} computing
            <Icon name={expanded ? "chevronUp" : "chevronDown"} size="xxs" />
          </button>
        ) : null}
      </div>
      {expanded && batches.length > 0 ? (
        <div className={batchListStyle}>
          {batches.map((batch) => (
            <BatchRow key={batch.id} batch={batch} />
          ))}
        </div>
      ) : null}
    </div>
  );
};
