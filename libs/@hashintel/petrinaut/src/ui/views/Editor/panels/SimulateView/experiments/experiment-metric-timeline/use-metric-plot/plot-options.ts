/**
 * uPlot option builders for the timeline's two chart shapes: the
 * time-series chart (line, bands, or heatmap backdrop) and the
 * aggregated-distribution bar chart.
 */
import uPlot from "uplot";

import { distributionBandSeries } from "../shared/distribution-bands";
import { binValueRange } from "../shared/distribution-math";

import type {
  DistributionView,
  RunAggregation,
  TimeTrace,
} from "../shared/distribution-math";
import type { MetricFrame } from "../shared/metric-frames";

export function chartOptions(
  width: number,
  height: number,
  outputType: MetricFrame["outputType"],
  aggregateRuns: boolean,
  runAggregation: RunAggregation,
  distributionView: DistributionView,
  timeTrace: TimeTrace,
  framesRef: { current: readonly MetricFrame[] },
  timeDomain: readonly [number, number] | undefined,
  yFloor: { current: number },
  plugins: uPlot.Plugin[],
): uPlot.Options {
  const isDistribution = outputType === "distribution";
  const showsSpread = isDistribution && !aggregateRuns;
  const isHeatmap = showsSpread && distributionView === "heatmap";
  const isBands = showsSpread && distributionView === "bands";
  const isTraced = !showsSpread && timeTrace !== "value";

  const rangeWithBaseline = (min: number, max: number): [number, number] => {
    if (min === max) {
      const padding = Math.max(1, Math.abs(max) * 0.05);

      return [Math.min(0, min - padding), max + padding];
    }

    return [Math.min(0, min), max];
  };

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

  return {
    width,
    height,
    pxAlign: false,
    padding: [0, 8, 4, null],
    plugins,
    cursor: {
      drag: { x: false, y: false, setScale: false },
      lock: true,
    },
    legend: {
      show: false,
    },
    scales: {
      // A pinned domain keeps the x viewport still while frames stream in;
      // without one the axis grows with the data.
      x: timeDomain
        ? { time: false, range: () => [timeDomain[0], timeDomain[1]] }
        : { time: false },
      y: {
        // The y ceiling only ratchets up (`yFloor` holds the highest ceiling
        // this view has shown), so streaming never shrinks the scale and a
        // re-stream after a parameter change keeps the previous frame of
        // reference — including while the data is momentarily empty.
        /* eslint-disable no-param-reassign -- `yFloor` is a deliberately
           shared ratchet: these callbacks raise it as data streams in. */
        range: (_u, min, max) => {
          if (isHeatmap) {
            const range = binValueRange(framesRef.current);
            if (!range) {
              return [0, Math.max(1, yFloor.current)];
            }
            yFloor.current = Math.max(yFloor.current, range[1]);
            return rangeWithBaseline(
              range[0],
              Math.max(range[1], yFloor.current),
            );
          }

          if (!Number.isFinite(min) || !Number.isFinite(max)) {
            return [0, Math.max(1, yFloor.current)];
          }

          yFloor.current = Math.max(yFloor.current, max);
          return rangeWithBaseline(min, Math.max(max, yFloor.current));
        },
        /* eslint-enable no-param-reassign */
      },
    },
    axes: [
      {
        show: true,
        side: 0,
        size: 26,
        font: "10px system-ui",
        stroke: "#475569",
        grid: { stroke: "#f3f4f6", width: 1 },
        ticks: { stroke: "#cbd5e1", width: 1, size: 6 },
        values: (_u, vals) => vals.map((value) => `${value}s`),
      },
      {
        show: true,
        size: 54,
        font: "10px system-ui",
        stroke: "#999",
        grid: { stroke: "#f3f4f6", width: 1, dash: [4, 4] },
        ticks: { stroke: "#e5e7eb", width: 1 },
      },
    ],
    series,
  };
}

const distributionBarsPath = uPlot.paths.bars?.({
  size: [0.85, Infinity],
  align: 0,
});

// A vertical bar chart of an aggregated distribution: value on the x-axis,
// aggregated frequency as the bar height.
export function distributionBarChartOptions(
  width: number,
  height: number,
): uPlot.Options {
  return {
    width,
    height,
    pxAlign: false,
    padding: [8, 8, 0, null],
    cursor: {
      drag: { x: false, y: false, setScale: false },
      lock: true,
    },
    legend: {
      show: false,
    },
    scales: {
      x: { time: false, range: (_u, min, max) => [min - 0.75, max + 0.75] },
      y: {
        range: (_u, _min, max) =>
          Number.isFinite(max) && max > 0 ? [0, max * 1.05] : [0, 1],
      },
    },
    axes: [
      {
        show: true,
        font: "10px system-ui",
        stroke: "#475569",
        grid: { stroke: "#f3f4f6", width: 1 },
        ticks: { stroke: "#cbd5e1", width: 1, size: 6 },
      },
      {
        show: true,
        size: 54,
        font: "10px system-ui",
        stroke: "#999",
        grid: { stroke: "#f3f4f6", width: 1, dash: [4, 4] },
        ticks: { stroke: "#e5e7eb", width: 1 },
      },
    ],
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
  };
}
