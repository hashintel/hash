/**
 * A summary's compute readout: the progress bar for the thing the drawer
 * shows, an optional thinner bar for the batch feeding it, and a compact,
 * toggleable list of every batch computing right now — a sweep runs the
 * selection's ladder, surface chunks and cell refinements in parallel, a
 * study its steps and the navigated point's refinement — so the list shows
 * that parallelism. Collapsed, it is one line ("N computing"); the toggle
 * hides when nothing computes.
 */
import { useState } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

/** One computing batch, for the expanded list. */
export type ComputeActivityBatch = {
  id: string;
  label: string;
  /** Priority work draws in blue; background work in grey. */
  tone: "priority" | "background";
  runCount: number;
  completedRuns: number;
};

/** A progress bar's fill and the label under it; no label leaves the slot empty. */
export type ComputeActivityBar = {
  percent: number;
  label?: string;
};

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

const secondaryTrackStyle = css({
  height: "[3px]",
  width: "full",
  marginTop: "[3px]",
  backgroundColor: "neutral.s20",
  borderRadius: "full",
  overflow: "hidden",
});

const secondaryFillStyle = css({
  height: "full",
  borderRadius: "full",
  backgroundColor: "blue.s100",
  transition: "[width 160ms ease-out]",
});

const metaRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  marginTop: "1",
});

const metaLabelsStyle = css({
  display: "flex",
  alignItems: "baseline",
  gap: "2",
  minWidth: "[0]",
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

const secondaryLabelStyle = css({
  fontSize: "[11px]",
  color: "blue.s100",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
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
  gridTemplateColumns: "[minmax(76px, auto) minmax(0, 1fr) 88px]",
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
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "[220px]",
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

const BatchRow = ({ batch }: { batch: ComputeActivityBatch }) => {
  const percent =
    batch.runCount > 0
      ? Math.min(100, (batch.completedRuns / batch.runCount) * 100)
      : 0;

  return (
    <div className={batchRowStyle}>
      <span className={batchLabelStyle} title={batch.label}>
        <span className={batchDotStyle} data-tone={batch.tone} />
        {batch.label}
      </span>
      <div className={batchTrackStyle}>
        <div
          className={batchFillStyle}
          data-tone={batch.tone}
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
  bar,
  secondaryBar = null,
  batches,
}: {
  bar: ComputeActivityBar;
  /** A thinner bar beneath the main one; null hides it. */
  secondaryBar?: ComputeActivityBar | null;
  batches: readonly ComputeActivityBatch[];
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div className={barTrackStyle}>
        <div className={barFillStyle} style={{ width: `${bar.percent}%` }} />
      </div>
      {secondaryBar ? (
        <div className={secondaryTrackStyle}>
          <div
            className={secondaryFillStyle}
            style={{ width: `${secondaryBar.percent}%` }}
          />
        </div>
      ) : null}
      <div className={metaRowStyle}>
        <span className={metaLabelsStyle}>
          {bar.label === undefined ? null : (
            <span className={metaLabelStyle}>{bar.label}</span>
          )}
          {secondaryBar ? (
            <span className={secondaryLabelStyle}>{secondaryBar.label}</span>
          ) : null}
        </span>
        <span
          className={toggleSlotStyle}
          data-idle={batches.length === 0}
          aria-hidden={batches.length === 0}
        >
          <button
            type="button"
            className={toggleStyle}
            aria-expanded={expanded}
            disabled={batches.length === 0}
            onClick={() => setExpanded((previous) => !previous)}
          >
            <span className={computingDotStyle} />
            {batches.length} computing
            <Icon name={expanded ? "chevronUp" : "chevronDown"} size="xxs" />
          </button>
        </span>
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
