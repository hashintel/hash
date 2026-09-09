/**
 * The objective over the study's steps: every step's value as a dot, the
 * best so far as a step line over them, in a card of fixed height. A port
 * of Optuna's `plot_optimization_history`.
 */
import { useEffect, useRef } from "react";
import uPlot from "uplot";

import { css } from "@hashintel/ds-helpers/css";
import "uplot/dist/uPlot.min.css";

import { useElementSize } from "../../../../../../../react/hooks/use-element-size";
import { ChartCard, type ChartCardTone } from "../../shared/chart-card";
import {
  buildObjectiveHistory,
  toObjectiveHistoryData,
} from "./objective-history-data";

import type { OptimizationRecord } from "../../../../../../../react/optimizations/context";

const UPlot = uPlot;

/** Optuna's grey for a step whose parameters broke a constraint. */
export const INFEASIBLE_STEP_COLOR = "#cccccc";
const STEP_COLOR = "#9ca3af";
const BEST_COLOR = "#2563eb";

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

const chartOptions = ({
  width,
  height,
  infeasibleColor,
}: {
  width: number;
  height: number;
  infeasibleColor: string;
}): uPlot.Options => ({
  width,
  height,
  pxAlign: false,
  padding: [8, 8, 0, null],
  cursor: {
    drag: { x: false, y: false, setScale: false },
    lock: true,
  },
  legend: { show: false },
  scales: {
    // Half a step of air on each side, so the first and last dots are whole.
    x: {
      time: false,
      range: (_u, min, max) => [
        Math.min(min, 1) - 0.5,
        Math.max(max, min + 1) + 0.5,
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
      size: 26,
      font: "10px system-ui",
      stroke: "#475569",
      grid: { stroke: "#f3f4f6", width: 1 },
      ticks: { stroke: "#cbd5e1", width: 1, size: 6 },
      incrs: stepIncrements,
      values: (_u, values) =>
        values.map((value) => (Number.isInteger(value) ? String(value) : "")),
    },
    {
      show: true,
      size: 54,
      font: "10px system-ui",
      stroke: "#999",
      grid: { stroke: "#f3f4f6", width: 1, dash: [4, 4] },
      ticks: { stroke: "#e5e7eb", width: 1 },
      values: (_u, values) => values.map((value) => tickFormat.format(value)),
    },
  ],
  series: [
    {},
    {
      label: "step",
      stroke: STEP_COLOR,
      // Dots only: the line between steps would suggest an order that is
      // not there.
      paths: () => null,
      points: { show: true, size: 6, fill: STEP_COLOR, stroke: STEP_COLOR },
    },
    {
      label: "best so far",
      stroke: BEST_COLOR,
      width: 2,
      paths: UPlot.paths.stepped?.({ align: 1 }),
      points: { show: false },
    },
    {
      label: "infeasible step",
      stroke: infeasibleColor,
      paths: () => null,
      points: {
        show: true,
        size: 6,
        fill: infeasibleColor,
        stroke: infeasibleColor,
      },
    },
  ],
});

export const ObjectiveHistoryChart = ({
  optimization,
  plotHeight,
  infeasibleColor = INFEASIBLE_STEP_COLOR,
}: {
  optimization: Pick<OptimizationRecord, "trials" | "input">;
  /** The plot's height in pixels; the component is exactly this tall. */
  plotHeight: number;
  /** Colour for a step whose parameters broke a constraint. */
  infeasibleColor?: string;
}) => {
  const chartRootRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(chartRootRef, { debounce: 50 });
  const plotRef = useRef<uPlot | null>(null);
  const points = buildObjectiveHistory(
    optimization.trials,
    optimization.input.objective.direction,
  );
  const data = toObjectiveHistoryData(points);
  const width = size?.width ?? 0;

  useEffect(() => {
    const root = chartRootRef.current;
    if (!root || width === 0) {
      return;
    }
    const plot = new UPlot(
      chartOptions({ width, height: plotHeight, infeasibleColor }),
      [[], [], [], []] as uPlot.AlignedData,
      root,
    );
    plotRef.current = plot;
    return () => {
      plotRef.current = null;
      plot.destroy();
    };
  }, [infeasibleColor, plotHeight, width]);

  // The data is applied in its own effect so a new step redraws the plot
  // without recreating it, and a freshly created plot picks it up too.
  useEffect(() => {
    plotRef.current?.setData(data);
  }, [data, width]);

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

/** The chart in its card, titled after the objective metric. */
export const ObjectiveHistoryCard = ({
  optimization,
  plotHeight,
  infeasibleColor,
  tone,
}: {
  optimization: Pick<OptimizationRecord, "trials" | "input" | "best">;
  plotHeight: number;
  infeasibleColor?: string;
  /** How the card reads: `paused` while the study is paused. */
  tone?: ChartCardTone;
}) => {
  const { input } = optimization;
  const metric = input.model.definition.metrics?.find(
    (candidate) => candidate.id === input.objective.metricId,
  );
  const metricName = metric?.name ?? input.objective.metricId;
  const completed = optimization.trials.filter(
    (trial) => trial.state === "complete",
  ).length;
  return (
    <ChartCard
      title="Objective by step"
      subtitle={`${metricName} per step · best so far as a line · ${completed} completed`}
      help="Each dot is one step's objective value; the line is the best value found up to that step. Pruned and failed steps have no dot."
      bodyHeight={plotHeight}
      tone={tone}
    >
      <ObjectiveHistoryChart
        optimization={optimization}
        plotHeight={plotHeight}
        infeasibleColor={infeasibleColor}
      />
    </ChartCard>
  );
};
