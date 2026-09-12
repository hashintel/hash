/**
 * The objective over a study's steps: every step's value as a dot, the best
 * so far as a step line over them, at a fixed height. A port of Optuna's
 * `plot_optimization_history`, drawn from points a caller builds with
 * `buildObjectiveHistory`, so one chart serves the study drawer's card and
 * the sweep's strip: the palette and sizes come in as a style, the x axis
 * can be pinned to a right edge the data has not reached yet, and dashed
 * dividers can mark where one study ended and the next began.
 */
import { useEffect, useRef } from "react";
import uPlot from "uplot";

import { css } from "@hashintel/ds-helpers/css";
import "uplot/dist/uPlot.min.css";

import { useElementSize } from "../../../../../../react/hooks/use-element-size";
import {
  type ObjectiveHistoryPoint,
  toObjectiveHistoryData,
} from "./objective-history-data";

const UPlot = uPlot;

/** The canvas colours and sizes; raw hex, since uPlot paints a canvas the tokens cannot reach. */
export type ObjectiveHistoryStyle = {
  step: { fill: string; stroke: string; size: number };
  best: string;
  axisText: { x: string; y: string };
  grid: string;
  ticks: { x: string; y: string };
  divider: string;
  /** The x axis's and the y axis's reserved size in pixels. */
  axisSize: { x: number; y: number };
  /** Air above the topmost dot, in pixels. */
  paddingTop: number;
};

/** The study drawer's look: grey dots, a blue best line. */
export const defaultObjectiveHistoryStyle: ObjectiveHistoryStyle = {
  step: { fill: "#9ca3af", stroke: "#9ca3af", size: 6 },
  best: "#2563eb",
  axisText: { x: "#475569", y: "#999" },
  grid: "#f3f4f6",
  ticks: { x: "#cbd5e1", y: "#e5e7eb" },
  divider: "#e5e7eb",
  axisSize: { x: 26, y: 54 },
  paddingTop: 8,
};

const frameStyle = css({
  position: "relative",
  width: "full",
  minWidth: "[0]",
});

const chartStyle = css({
  width: "full",
  height: "full",
  minWidth: "[0]",
});

const waitingStyle = css({
  position: "absolute",
  inset: "[0]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "xs",
  color: "neutral.s70",
  pointerEvents: "none",
});

const stepIncrements = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1_000];

const tickFormat = new Intl.NumberFormat("en-US", {
  maximumSignificantDigits: 4,
});

/** Paints a dashed vertical line half a step before each divider step, over the plot area. */
const drawDividers = (
  plot: uPlot,
  dividers: readonly number[],
  color: string,
): void => {
  if (dividers.length === 0) {
    return;
  }
  const { ctx, bbox } = plot;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  for (const step of dividers) {
    const x = plot.valToPos(step - 0.5, "x", true);
    ctx.beginPath();
    ctx.moveTo(x, bbox.top);
    ctx.lineTo(x, bbox.top + bbox.height);
    ctx.stroke();
  }
  ctx.restore();
};

const chartOptions = ({
  width,
  height,
  style,
  xMax,
  dividers,
}: {
  width: number;
  height: number;
  style: ObjectiveHistoryStyle;
  xMax: number | undefined;
  dividers: readonly number[];
}): uPlot.Options => ({
  width,
  height,
  pxAlign: false,
  padding: [style.paddingTop, 8, 0, null],
  cursor: {
    drag: { x: false, y: false, setScale: false },
    lock: true,
  },
  legend: { show: false },
  scales: {
    // Half a step of air on each side, so the first and last dots are whole;
    // a pinned right edge holds until the steps reach it.
    x: {
      time: false,
      range: (_u, min, max) => [
        Math.min(min, 1) - 0.5,
        Math.max(xMax ?? max, min + 1) + 0.5,
      ],
    },
    y: {
      range: (_u, min, max) => {
        if (!Number.isFinite(min) || !Number.isFinite(max)) {
          return [0, 1];
        }
        const padding =
          min === max ? Math.max(1, Math.abs(max) * 0.05) : (max - min) * 0.08;
        return [min - padding, max + padding];
      },
    },
  },
  // uPlot mutates its axis options, so each instance gets its own.
  axes: [
    {
      show: true,
      side: 2,
      size: style.axisSize.x,
      font: "10px system-ui",
      stroke: style.axisText.x,
      grid: { stroke: style.grid, width: 1 },
      ticks: { stroke: style.ticks.x, width: 1, size: 6 },
      incrs: stepIncrements,
      values: (_u, values) =>
        values.map((value) => (Number.isInteger(value) ? String(value) : "")),
    },
    {
      show: true,
      size: style.axisSize.y,
      font: "10px system-ui",
      stroke: style.axisText.y,
      grid: { stroke: style.grid, width: 1, dash: [4, 4] },
      ticks: { stroke: style.ticks.y, width: 1 },
      values: (_u, values) => values.map((value) => tickFormat.format(value)),
    },
  ],
  series: [
    {},
    {
      label: "step",
      stroke: style.step.stroke,
      // Dots only: the line between steps would suggest an order that is
      // not there.
      paths: () => null,
      points: {
        show: true,
        size: style.step.size,
        fill: style.step.fill,
        stroke: style.step.stroke,
      },
    },
    {
      label: "best so far",
      stroke: style.best,
      width: 2,
      paths: UPlot.paths.stepped?.({ align: 1 }),
      points: { show: false },
    },
  ],
  hooks: {
    draw: [(plot) => drawDividers(plot, dividers, style.divider)],
  },
});

const noDividers: readonly number[] = [];

export const ObjectiveHistoryChart = ({
  points,
  plotHeight,
  style = defaultObjectiveHistoryStyle,
  xMax,
  dividers = noDividers,
}: {
  points: readonly ObjectiveHistoryPoint[];
  /** The plot's height in pixels; the component is exactly this tall. */
  plotHeight: number;
  style?: ObjectiveHistoryStyle;
  /** Pins the x axis's right edge; without it the axis follows the last step. */
  xMax?: number;
  /** Steps a dashed vertical line is drawn before: where a new study began. */
  dividers?: readonly number[];
}) => {
  const chartRootRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(chartRootRef);
  const plotRef = useRef<uPlot | null>(null);
  const data = toObjectiveHistoryData(points, dividers);
  const width = size?.width ?? 0;
  const hasWidth = width > 0;
  // The dividers reach the plot through its options; a change of them (a
  // further study) rebuilds it once, never per step.
  const dividersKey = dividers.join(",");

  // The plot lives as long as the root has a width; a resize is pushed into
  // it below rather than rebuilding it, so a drawer drag keeps the canvas,
  // the axes and the cursor.
  useEffect(() => {
    const root = chartRootRef.current;
    if (!root || !hasWidth) {
      return;
    }
    const plot = new UPlot(
      chartOptions({
        width: root.clientWidth,
        height: plotHeight,
        style,
        xMax,
        dividers: dividersKey === "" ? [] : dividersKey.split(",").map(Number),
      }),
      [[], [], []] as uPlot.AlignedData,
      root,
    );
    plotRef.current = plot;
    return () => {
      plotRef.current = null;
      plot.destroy();
    };
  }, [hasWidth, plotHeight, style, xMax, dividersKey]);

  useEffect(() => {
    plotRef.current?.setSize({ width, height: plotHeight });
  }, [width, plotHeight]);

  // The data is applied in its own effect so a new step redraws the plot
  // without recreating it, and a freshly created plot picks it up too.
  useEffect(() => {
    plotRef.current?.setData(data);
  }, [data, hasWidth]);

  return (
    <div
      className={frameStyle}
      style={{ height: plotHeight, minHeight: plotHeight }}
      aria-label="Objective history"
    >
      <div ref={chartRootRef} className={chartStyle} />
      {points.length === 0 ? (
        <span className={waitingStyle}>Waiting for the first step</span>
      ) : null}
    </div>
  );
};
