/**
 * The summary's compute readout: the selected combination's progress bar plus
 * a compact, toggleable list of every batch computing right now — a sweep
 * runs the selection's ladder, surface chunks, and cell refinements in
 * parallel, and the list shows that parallelism. Collapsed, it is one line
 * ("N computing"); nothing renders when nothing computes.
 */
import { useState } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { experimentProgressPercent } from "../../../../../shared/experiment-progress";

import type {
  ExperimentRecord,
  SweepBatchStatus,
} from "../../../../../../../../react/experiments/context";

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
});

// The toggle stays in the row while nothing computes so the row keeps its
// height, and the sections below hold still when batches start and finish.
const toggleSlotStyle = css({
  display: "inline-flex",
  "&[data-idle=true]": { visibility: "hidden" },
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
  sweepBatches,
  sweep,
  progress,
  runCount,
  maxTime,
}: Pick<
  ExperimentRecord,
  "sweepBatches" | "sweep" | "progress" | "runCount" | "maxTime"
>) => {
  const [expanded, setExpanded] = useState(false);
  const percent = experimentProgressPercent({
    sweep,
    progress,
    runCount,
    maxTime,
  });
  const barLabel = sweep
    ? `Selection · ${sweep.runsSampled.toLocaleString("en-US")} / ${runCount.toLocaleString("en-US")} runs`
    : `Time · ${(progress?.time ?? 0).toLocaleString("en-US")} / ${maxTime.toLocaleString("en-US")}`;

  return (
    <div>
      <div className={barTrackStyle}>
        <div className={barFillStyle} style={{ width: `${percent}%` }} />
      </div>
      <div className={metaRowStyle}>
        <span className={metaLabelStyle}>{barLabel}</span>
        <span
          className={toggleSlotStyle}
          data-idle={sweepBatches.length === 0}
          aria-hidden={sweepBatches.length === 0}
        >
          <button
            type="button"
            className={toggleStyle}
            aria-expanded={expanded}
            disabled={sweepBatches.length === 0}
            onClick={() => setExpanded((previous) => !previous)}
          >
            <span className={computingDotStyle} />
            {sweepBatches.length} computing
            <Icon name={expanded ? "chevronUp" : "chevronDown"} size="xxs" />
          </button>
        </span>
      </div>
      {expanded && sweepBatches.length > 0 ? (
        <div className={batchListStyle}>
          {sweepBatches.map((batch) => (
            <BatchRow key={batch.id} batch={batch} />
          ))}
        </div>
      ) : null}
    </div>
  );
};
