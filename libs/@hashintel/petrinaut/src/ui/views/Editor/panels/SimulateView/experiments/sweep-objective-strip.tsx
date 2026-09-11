/**
 * The sweep's objective by step, under the Parameters card's sliders: a
 * disclosure row (a dot that breathes while a study drives the sweep, the
 * title, the last study's metric with the steps run and the best found, a
 * chevron) over a fold holding the shared objective chart in purple. Every
 * study started from the sweep draws on one axis, oldest first, numbered end
 * to end, with a dashed divider where each further study began and its own
 * best-so-far line. Mounted from the first Optimize on and kept while the
 * drawer lives; the fold clips height alone, so the plot keeps taking steps
 * while collapsed and reopens on the current picture.
 */
import { useId, useState } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { Fold } from "../shared/drawer-frame/fold";
import { formatNumber } from "../shared/format-value";
import {
  ObjectiveHistoryChart,
  type ObjectiveHistoryStyle,
} from "../shared/objective-history-chart";
import { buildSweepObjectiveHistory } from "./sweep-objective-strip/sweep-objective-history";

import type { OptimizationRecord } from "../../../../../../react/optimizations/context";

/** The chart's height in pixels, x axis included; the fold's open height is a constant. */
export const SWEEP_OBJECTIVE_PLOT_HEIGHT = 120;

/** The strip's palette: the purple ramp's light hexes, since a canvas cannot read the tokens. */
const sweepObjectiveStyle: ObjectiveHistoryStyle = {
  step: { fill: "#be93e4", stroke: "#a671d5", size: 5 },
  best: "#8347b9",
  axisText: { x: "#5f3289", y: "#5f3289" },
  grid: "#f2e2fc",
  ticks: { x: "#e0c4f4", y: "#e0c4f4" },
  divider: "#d1afec",
  axisSize: { x: 22, y: 44 },
  paddingTop: 6,
};

const stripStyle = css({
  marginTop: "3",
  minWidth: "[0]",
  borderTopWidth: "[1px]",
  borderTopStyle: "solid",
  borderTopColor: "purple.s40",
});

// One control the width of the strip; its text is its name.
const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "full",
  height: "[24px]",
  minWidth: "[0]",
  margin: "[0]",
  paddingX: "1",
  paddingY: "[0]",
  borderWidth: "[0]",
  borderRadius: "md",
  backgroundColor: "[transparent]",
  color: "purple.s115",
  font: "[inherit]",
  textAlign: "left",
  cursor: "pointer",
  "&:hover": { backgroundColor: "purple.s20" },
  "&:focus-visible": {
    outline: "[2px solid var(--colors-purple-s80)]",
    outlineOffset: "[-2px]",
  },
  "[data-animate=true] &": {
    transition: "[background-color 120ms ease-out]",
  },
});

const chevronStyle = css({
  display: "inline-flex",
  flexShrink: "0",
  color: "purple.s100",
  "&[data-open=false]": { transform: "rotate(-90deg)" },
  "[data-animate=true] &": { transition: "[transform 160ms ease-out]" },
});

// The dot is always there, so the title never moves; driving, its halo
// breathes the way the card's does.
const dotStyle = css({
  position: "relative",
  width: "[6px]",
  height: "[6px]",
  flexShrink: "0",
  borderRadius: "full",
  backgroundColor: "purple.s60",
  "&[data-driving=true]": { backgroundColor: "purple.s90" },
  "&[data-driving=true]::after": {
    content: '""',
    position: "absolute",
    inset: "[0]",
    borderRadius: "[inherit]",
    boxShadow:
      "[0 0 0 3px var(--colors-purple-a40), 0 0 8px var(--colors-purple-a60)]",
    opacity: "[0]",
    "[data-animate=true] &": {
      animationName: "[petrinautOptimizingGlow]",
      animationDuration: "[2.4s]",
      animationTimingFunction: "ease-in-out",
      animationIterationCount: "[infinite]",
    },
  },
});

const titleStyle = css({
  flexShrink: "0",
  fontSize: "xs",
  fontWeight: "medium",
  whiteSpace: "nowrap",
});

const summaryStyle = css({
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "xs",
  fontVariantNumeric: "tabular-nums",
  color: "purple.s100",
});

// Air under the row so the first dot's halo clears it.
const chartWrapStyle = css({
  paddingTop: "2",
});

/** `Infected peak · 47 steps in 2 optimizations · best 650.500`; without a metric name, `0 steps`. */
const describeHistory = (
  metricName: string,
  steps: number,
  studies: number,
  best: number | null,
): string =>
  [
    ...(metricName === "" ? [] : [metricName]),
    `${steps} ${steps === 1 ? "step" : "steps"}${
      studies > 1 ? ` in ${studies} optimizations` : ""
    }`,
    ...(best === null ? [] : [`best ${formatNumber(best)}`]),
  ].join(" · ");

export const SweepObjectiveStrip = ({
  studies,
  driving,
}: {
  /** Every study started from the sweep, oldest first; never empty. */
  studies: readonly OptimizationRecord[];
  /** Whether the last study drives the sweep now: the row's dot breathes. */
  driving: boolean;
}) => {
  const [expanded, setExpanded] = useState(true);
  const foldId = useId();
  const history = buildSweepObjectiveHistory(studies);

  return (
    <div className={stripStyle} data-sweep-objective-strip>
      <button
        type="button"
        className={rowStyle}
        aria-expanded={expanded}
        aria-controls={foldId}
        onClick={() => setExpanded((previous) => !previous)}
      >
        <span className={chevronStyle} data-open={expanded}>
          <Icon name="chevronDown" size="sm" />
        </span>
        <span className={dotStyle} data-driving={driving} />
        <span className={titleStyle}>Objective by step</span>
        <span className={summaryStyle}>
          {describeHistory(
            history.metricName,
            history.points.length,
            history.studyCount,
            history.best,
          )}
        </span>
      </button>
      <Fold open={expanded} id={foldId} data-sweep-objective>
        <div className={chartWrapStyle}>
          <ObjectiveHistoryChart
            points={history.points}
            plotHeight={SWEEP_OBJECTIVE_PLOT_HEIGHT}
            style={sweepObjectiveStyle}
            xMax={history.xMax}
            dividers={history.dividers}
            // A study about to draw its first step is waited for; a history
            // whose every study failed at start has run none.
            emptyLabel={
              history.studyCount === 0
                ? "No steps run"
                : "Waiting for the first step"
            }
          />
        </div>
      </Fold>
    </div>
  );
};
