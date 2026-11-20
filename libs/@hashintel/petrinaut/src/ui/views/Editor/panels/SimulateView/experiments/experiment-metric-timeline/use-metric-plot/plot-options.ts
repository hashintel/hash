/**
 * uPlot option builders for the timeline's two chart shapes: the time-series
 * chart (line, percentile bands, or heatmap backdrop) and the
 * aggregated-distribution bar chart.
 */
import uPlot from "uplot";

import { distributionBandSeries } from "../shared/distribution-bands";
import { binValueSummary } from "./shared/bin-value-summary";

import type {
  DistributionView,
  RunAggregation,
  TimeTrace,
} from "../shared/distribution-math";
import type { MetricFrame } from "../shared/metric-frames";

/**
 * The highest y ceiling a view has shown. The range callbacks only raise it,
 * so streaming never shrinks the scale and a re-stream after a parameter
 * change keeps its frame of reference, including while the data is
 * momentarily empty.
 */
export type YCeiling = { value: number };

type ChartShape = {
  outputType: MetricFrame["outputType"];
  aggregateRuns: boolean;
  runAggregation: RunAggregation;
  distributionView: DistributionView;
  timeTrace: TimeTrace;
  /** Pins the x axis; without it the axis grows with the data. */
  timeDomain: readonly [number, number] | undefined;
};

const rangeWithBaseline = (min: number, max: number): [number, number] => {
  if (min === max) {
    const padding = Math.max(1, Math.abs(max) * 0.05);
    return [Math.min(0, min - padding), max + padding];
  }
  return [Math.min(0, min), max];
};

/** What both charts share: no legend, and a cursor that locks in place of a drag to zoom. */
const baseOptions = (width: number, height: number) => ({
  width,
  height,
  pxAlign: false,
  cursor: { drag: { x: false, y: false, setScale: false }, lock: true },
  legend: { show: false },
});

// uPlot mutates its axis options, so each chart gets its own.
const xAxis = (): uPlot.Axis => ({
  show: true,
  font: "10px system-ui",
  stroke: "#475569",
  grid: { stroke: "#f3f4f6", width: 1 },
  ticks: { stroke: "#cbd5e1", width: 1, size: 6 },
});

const yAxis = (): uPlot.Axis => ({
  show: true,
  size: 54,
  font: "10px system-ui",
  stroke: "#999",
  grid: { stroke: "#f3f4f6", width: 1, dash: [4, 4] },
  ticks: { stroke: "#e5e7eb", width: 1 },
});

export const chartOptions = ({
  width,
  height,
  shape,
  getFrames,
  yCeiling,
  plugins,
}: {
  width: number;
  height: number;
  shape: ChartShape;
  /** The plotted frames, read when the y scale ranges. */
  getFrames: () => readonly MetricFrame[];
  yCeiling: YCeiling;
  plugins: uPlot.Plugin[];
}): uPlot.Options => {
  const { outputType, aggregateRuns, runAggregation, distributionView } = shape;
  const { timeTrace, timeDomain } = shape;
  const isDistribution = outputType === "distribution";
  const showsSpread = isDistribution && !aggregateRuns;
  const isHeatmap = showsSpread && distributionView === "heatmap";
  const isBands = showsSpread && distributionView === "bands";
  const isTraced = !showsSpread && timeTrace !== "value";

  const series: uPlot.Series[] = isBands
    ? [
        {},
        ...distributionBandSeries.map((band) => ({
          label: band.label,
          stroke: band.stroke,
          width: band.width,
          dash: band.dash,
          points: { show: false },
        })),
      ]
    : [
        {},
        {
          label: isDistribution
            ? `${runAggregation}${isTraced ? ` ${timeTrace}` : ""}`
            : "value",
          stroke: isTraced ? "#d97706" : "#111827",
          width: 2,
          dash: isTraced ? [8, 6] : undefined,
          points: { show: false },
        },
      ];

  /* eslint-disable no-param-reassign -- `yCeiling` is the ratchet these
     callbacks raise */
  const yRange: uPlot.Scale.Range = (_u, min, max) => {
    if (isHeatmap) {
      const values = binValueSummary(getFrames());
      if (!values) {
        return [0, Math.max(1, yCeiling.value)];
      }
      yCeiling.value = Math.max(yCeiling.value, values.max);
      return rangeWithBaseline(
        values.min,
        Math.max(values.max, yCeiling.value),
      );
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return [0, Math.max(1, yCeiling.value)];
    }
    yCeiling.value = Math.max(yCeiling.value, max);
    return rangeWithBaseline(min, Math.max(max, yCeiling.value));
  };
  /* eslint-enable no-param-reassign */

  return {
    ...baseOptions(width, height),
    padding: [0, 8, 4, null],
    plugins,
    scales: {
      x: timeDomain
        ? { time: false, range: () => [timeDomain[0], timeDomain[1]] }
        : { time: false },
      y: { range: yRange },
    },
    axes: [
      {
        ...xAxis(),
        side: 0,
        size: 26,
        values: (_u, vals) => vals.map((value) => `${value}s`),
      },
      yAxis(),
    ],
    series,
  };
};

const distributionBarsPath = uPlot.paths.bars?.({
  size: [0.85, Infinity],
  align: 0,
});

/** Bin value on the x axis, aggregated frequency as the bar height. */
export const distributionBarChartOptions = (
  width: number,
  height: number,
): uPlot.Options => ({
  ...baseOptions(width, height),
  padding: [8, 8, 0, null],
  scales: {
    x: { time: false, range: (_u, min, max) => [min - 0.75, max + 0.75] },
    y: {
      range: (_u, _min, max) =>
        Number.isFinite(max) && max > 0 ? [0, max * 1.05] : [0, 1],
    },
  },
  axes: [xAxis(), yAxis()],
  series: [
    {},
    {
      label: "frequency",
      stroke: "#111827",
      fill: "#111827",
      width: 1,
      paths: distributionBarsPath,
      points: { show: false },
    },
  ],
});
