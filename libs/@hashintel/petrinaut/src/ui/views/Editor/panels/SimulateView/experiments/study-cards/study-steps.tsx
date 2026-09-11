/**
 * The steps table in its fixed box beneath the columns: the steps scroll
 * inside it, the header row pinned.
 */
import { css } from "@hashintel/ds-helpers/css";

import { StepsTable } from "./steps-table";

import type { OptimizationRecord } from "../../../../../../../react/optimizations/context";

/** The steps table's fixed height in pixels; the steps scroll inside it. */
const STEPS_TABLE_HEIGHT = 320;

const stepsStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

const scrollStyle = css({
  overflowY: "auto",
  scrollbarWidth: "[thin]",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
  // Pin the table's header while the steps scroll beneath it. The sticky
  // element must be the header's rowgroup: a sticky row could only move
  // within that rowgroup, which is exactly as tall as the row itself.
  "& [role='table'] > [role='rowgroup']:first-child": {
    position: "sticky",
    top: "[0]",
    zIndex: "[1]",
  },
});

export const StudySteps = ({
  optimization,
  bestTrial,
}: {
  optimization: OptimizationRecord;
  /** The step to star; null marks none. */
  bestTrial: number | null;
}) => (
  <div className={stepsStyle} data-study-steps>
    <StepsTable
      optimization={optimization}
      bestTrial={bestTrial}
      className={scrollStyle}
      height={STEPS_TABLE_HEIGHT}
    />
  </div>
);
