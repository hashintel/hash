/**
 * The "N computing" chip on the frame's stats line and the list it opens: one
 * row per batch computing right now with its own progress. A sweep runs the
 * selection's ladder, surface chunks and cell refinements in parallel, a
 * study its steps and the navigated point's refinement, so the list shows
 * that parallelism. The list is a popover, so opening it moves nothing. The
 * chip is always drawn, `0 computing` and disabled while nothing runs, and is
 * as wide as a three-digit count, so the strip never moves around it. The
 * list closes with the last batch, so the next one does not reopen it.
 */
import { useRef, useState } from "react";

import { Icon, Popover } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { formatCount } from "../format-value";

/** One computing batch, for the list. */
export type ComputeBatch = {
  id: string;
  label: string;
  /** Priority work draws in blue; background work in grey. */
  tone: "priority" | "background";
  runCount: number;
  completedRuns: number;
};

/** The widest count the chip reserves room for. */
const WIDEST_COUNT = "000";

const slotStyle = css({
  display: "inline-flex",
  flexShrink: "0",
});

const chipStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  paddingX: "1.5",
  height: "[18px]",
  borderRadius: "sm",
  borderWidth: "[0]",
  fontSize: "[11px]",
  fontWeight: "medium",
  fontVariantNumeric: "tabular-nums",
  color: "neutral.s100",
  backgroundColor: "neutral.s10",
  cursor: "pointer",
  whiteSpace: "nowrap",
  _hover: { backgroundColor: "neutral.s20" },
  "&[data-idle=true]": {
    color: "neutral.s70",
    cursor: "default",
    _hover: { backgroundColor: "neutral.s10" },
  },
});

// The live text and the widest text share one grid cell, so the chip is as
// wide as `000 computing` whatever the count.
const chipTextStyle = css({
  display: "grid",
  "& > *": { gridArea: "[1 / 1]" },
});

const sizerStyle = css({
  visibility: "hidden",
});

const computingDotStyle = css({
  width: "[6px]",
  height: "[6px]",
  borderRadius: "full",
  backgroundColor: "blue.s100",
  "[data-idle=true] > &": { backgroundColor: "neutral.s50" },
});

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[3px]",
  minWidth: "[320px]",
  padding: "2",
});

const rowStyle = css({
  display: "grid",
  gridTemplateColumns: "[minmax(76px, auto) minmax(0, 1fr) 88px]",
  alignItems: "center",
  gap: "2",
  minHeight: "[16px]",
});

const labelStyle = css({
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

const dotStyle = css({
  width: "[6px]",
  height: "[6px]",
  borderRadius: "full",
  flexShrink: "0",
  backgroundColor: "neutral.s60",
  "&[data-tone=priority]": { backgroundColor: "blue.s100" },
});

const trackStyle = css({
  height: "[4px]",
  borderRadius: "full",
  backgroundColor: "neutral.s30",
  overflow: "hidden",
});

const fillStyle = css({
  height: "full",
  borderRadius: "full",
  backgroundColor: "neutral.s90",
  transition: "[width 160ms ease-out]",
  "&[data-tone=priority]": { backgroundColor: "blue.s100" },
});

const countStyle = css({
  fontSize: "[11px]",
  color: "neutral.s80",
  fontVariantNumeric: "tabular-nums",
  textAlign: "right",
  whiteSpace: "nowrap",
});

const BatchRow = ({ batch }: { batch: ComputeBatch }) => {
  const percent =
    batch.runCount > 0
      ? Math.min(100, (batch.completedRuns / batch.runCount) * 100)
      : 0;

  return (
    <div className={rowStyle}>
      <span className={labelStyle} title={batch.label}>
        <span className={dotStyle} data-tone={batch.tone} />
        {batch.label}
      </span>
      <div className={trackStyle}>
        <div
          className={fillStyle}
          data-tone={batch.tone}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className={countStyle}>
        {formatCount(batch.completedRuns)} / {formatCount(batch.runCount)} runs
      </span>
    </div>
  );
};

export const ComputeBatchesChip = ({
  batches,
}: {
  batches: readonly ComputeBatch[];
}) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const idle = batches.length === 0;
  if (idle && open) {
    setOpen(false);
  }

  return (
    <span className={slotStyle} data-idle={idle} data-compute-batches>
      <button
        ref={triggerRef}
        type="button"
        className={chipStyle}
        data-idle={idle}
        aria-expanded={open}
        disabled={idle}
        onClick={() => setOpen((previous) => !previous)}
      >
        <span className={computingDotStyle} />
        <span className={chipTextStyle}>
          <span className={sizerStyle} aria-hidden>
            {WIDEST_COUNT} computing
          </span>
          <span>{batches.length} computing</span>
        </span>
        <Icon name={open ? "chevronUp" : "chevronDown"} size="xxs" />
      </button>
      {open ? (
        <Popover
          triggerRef={triggerRef}
          position="bottom-end"
          onClose={() => setOpen(false)}
        >
          <Popover.Container>
            <div className={listStyle} data-compute-batches-list>
              {batches.map((batch) => (
                <BatchRow key={batch.id} batch={batch} />
              ))}
            </div>
          </Popover.Container>
        </Popover>
      ) : null}
    </span>
  );
};
