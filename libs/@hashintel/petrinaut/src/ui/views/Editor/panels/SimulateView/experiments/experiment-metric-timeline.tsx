import { Portal } from "@ark-ui/react/portal";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import uPlot from "uplot";

import {
  Button,
  Switch,
  usePortalContainerRef,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import "uplot/dist/uPlot.min.css";

import { useElementSize } from "../../../../../../react/hooks/use-element-size";
import { Select } from "../../../../../components/select";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";
import type { CSSProperties } from "react";

const UPlot = uPlot;

type MetricFrame = ExperimentRecord["metricFrames"][number];
type ScalarMetricFrame = Extract<MetricFrame, { outputType: "scalar" }>;
type DistributionMetricFrame = Extract<
  MetricFrame,
  { outputType: "distribution" }
>;
type SelectedFrameKey = {
  metricId: string;
  frameNumber: number;
  time: number;
};
type FramePopoverPointer = {
  clientX: number;
  clientY: number;
};
type FramePopoverPosition = {
  x: number;
  y: number;
  placement: "above" | "below";
};
type RunAggregation =
  | "mean"
  | "median"
  | "min"
  | "max"
  | "p10"
  | "p25"
  | "p75"
  | "p90";
type DistributionView = "heatmap" | "bands";
// How each frame's plotted value relates to history, when not aggregating the
// whole series into a single value.
type TimeTrace = "value" | "minToDate" | "maxToDate";
// How a scalar series is reduced to a single number when aggregating over time.
type TimeAggregation = "mean" | "min" | "max" | "sum";
// "large" fills the container width (default), "small" takes half the width.
export type MetricSize = "small" | "large";

const FRAME_POPOVER_WIDTH = 340;
const FRAME_POPOVER_MAX_HEIGHT = 248;
const FRAME_POPOVER_MARGIN = 10;
const FRAME_POPOVER_OFFSET = 10;

const rootStyle = css({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: "2",
  width: "full",
  minWidth: "[0]",
});

const headerStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "3",
});

const headerRightStyle = css({
  display: "flex",
  alignItems: "center",
  flexShrink: "0",
});

const titleStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.s120",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const chartStyle = css({
  height: "[260px]",
  minHeight: "[260px]",
  width: "full",
  minWidth: "[0]",
  _empty: {
    cursor: "default",
  },
  "& .u-over": {
    cursor: "crosshair",
    touchAction: "none",
  },
});

const footerStyle = css({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "4",
  flexWrap: "wrap",
  marginTop: "1",
  paddingTop: "2.5",
  borderTopWidth: "[1px]",
  borderTopStyle: "solid",
  borderTopColor: "neutral.bd.subtle",
  fontSize: "xs",
  color: "neutral.s80",
});

const footerBlockStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});

const footerBlockRightStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: "2",
});

const aggregationControlStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
});

const legendStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "center",
  columnGap: "3",
  rowGap: "1",
  paddingX: "1",
  fontSize: "[11px]",
  color: "neutral.s90",
});

const legendItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  whiteSpace: "nowrap",
});

const legendSwatchStyle = css({
  display: "inline-block",
  width: "[16px]",
  height: "[0]",
  flexShrink: "0",
});

const aggregationLabelStyle = css({
  color: "neutral.s90",
  fontWeight: "medium",
  whiteSpace: "nowrap",
});

const aggregationSelectStyle = css({
  width: "[144px]",
});

const emptyStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "[160px]",
  fontSize: "sm",
  color: "neutral.s80",
});

const aggregateNumberStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "[260px]",
  minHeight: "[260px]",
  width: "full",
  fontSize: "[44px]",
  fontWeight: "semibold",
  fontVariantNumeric: "tabular-nums",
  color: "neutral.s120",
});

const framePopoverStyle = css({
  position: "fixed",
  left: "[var(--frame-popover-x)]",
  top: "[var(--frame-popover-y)]",
  zIndex: "[99999]",
  width: "[min(340px, calc(100vw - 20px))]",
  maxHeight: "[248px]",
  overflow: "hidden",
  padding: "1.5",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
  backgroundColor: "neutral.s00",
  boxShadow:
    "[0 10px 24px rgba(15, 23, 42, 0.14), 0 0 0 1px rgba(15, 23, 42, 0.04)]",
  pointerEvents: "auto",
  userSelect: "none",
});

const frameDetailStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

const frameDetailHeaderStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "2",
  paddingRight: "[22px]",
});

const frameDetailTitleStyle = css({
  fontSize: "xs",
  fontWeight: "semibold",
  color: "neutral.s120",
  whiteSpace: "nowrap",
});

const frameDetailMetaStyle = css({
  fontSize: "[11px]",
  color: "neutral.s80",
  whiteSpace: "nowrap",
});

const framePopoverCloseStyle = css({
  position: "absolute",
  top: "[4px]",
  right: "[4px]",
});

const scalarFrameValueStyle = css({
  fontSize: "lg",
  fontWeight: "semibold",
  fontVariantNumeric: "tabular-nums",
  color: "neutral.s120",
  padding: "2",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "sm",
  backgroundColor: "neutral.s10",
});

const histogramRowsStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[1px]",
  maxHeight: "[196px]",
  overflowY: "auto",
  padding: "1",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "sm",
  backgroundColor: "neutral.s10",
});

const histogramRowStyle = css({
  display: "grid",
  gridTemplateColumns: "[38px minmax(0, 1fr) 36px]",
  alignItems: "center",
  gap: "1",
  minHeight: "[14px]",
});

const histogramValueStyle = css({
  fontSize: "[10px]",
  fontVariantNumeric: "tabular-nums",
  color: "neutral.s90",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const histogramTrackStyle = css({
  height: "[6px]",
  minWidth: "[0]",
  borderRadius: "full",
  backgroundColor: "neutral.s30",
  overflow: "hidden",
});

const histogramBarStyle = css({
  height: "full",
  borderRadius: "full",
  backgroundColor: "neutral.s120",
});

const histogramFrequencyStyle = css({
  fontSize: "[10px]",
  fontVariantNumeric: "tabular-nums",
  color: "neutral.s100",
  textAlign: "right",
});

function isScalarMetricFrame(frame: MetricFrame): frame is ScalarMetricFrame {
  return frame.outputType === "scalar";
}

function isDistributionMetricFrame(
  frame: MetricFrame,
): frame is DistributionMetricFrame {
  return frame.outputType === "distribution";
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getFramePopoverPosition(
  pointer: FramePopoverPointer,
  popoverHeight: number,
): FramePopoverPosition {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(
    FRAME_POPOVER_WIDTH,
    Math.max(280, viewportWidth - FRAME_POPOVER_MARGIN * 2),
  );
  const height = Math.min(
    FRAME_POPOVER_MAX_HEIGHT,
    Math.max(
      0,
      Math.min(popoverHeight, viewportHeight - FRAME_POPOVER_MARGIN * 2),
    ),
  );
  const maxX = Math.max(
    FRAME_POPOVER_MARGIN,
    viewportWidth - width - FRAME_POPOVER_MARGIN,
  );
  const maxY = Math.max(
    FRAME_POPOVER_MARGIN,
    viewportHeight - height - FRAME_POPOVER_MARGIN,
  );
  const canFitBelow =
    pointer.clientY + FRAME_POPOVER_OFFSET + height <=
    viewportHeight - FRAME_POPOVER_MARGIN;
  const placement = canFitBelow ? "below" : "above";
  const preferredY =
    placement === "below"
      ? pointer.clientY + FRAME_POPOVER_OFFSET
      : pointer.clientY - FRAME_POPOVER_OFFSET - height;

  return {
    x: clamp(
      pointer.clientX + FRAME_POPOVER_OFFSET,
      FRAME_POPOVER_MARGIN,
      maxX,
    ),
    y: clamp(preferredY, FRAME_POPOVER_MARGIN, maxY),
    placement,
  };
}

function sampleCountFromBins(bins: DistributionMetricFrame["bins"]): number {
  return bins.reduce((sum, [, frequency]) => sum + frequency, 0);
}

function meanFromBins(bins: DistributionMetricFrame["bins"]): number | null {
  const sampleCount = sampleCountFromBins(bins);
  if (sampleCount === 0) {
    return null;
  }

  return (
    bins.reduce((sum, [value, frequency]) => sum + value * frequency, 0) /
    sampleCount
  );
}

function minFromBins(bins: DistributionMetricFrame["bins"]): number | null {
  return bins[0]?.[0] ?? null;
}

function maxFromBins(bins: DistributionMetricFrame["bins"]): number | null {
  return bins.at(-1)?.[0] ?? null;
}

function percentileFromBins(
  bins: DistributionMetricFrame["bins"],
  fraction: number,
): number | null {
  const sampleCount = sampleCountFromBins(bins);
  if (sampleCount === 0) {
    return null;
  }

  const target = fraction * sampleCount;
  let cumulative = 0;

  for (const [value, frequency] of bins) {
    cumulative += frequency;
    if (cumulative >= target) {
      return value;
    }
  }

  return bins.at(-1)?.[0] ?? null;
}

function aggregateDistributionBins(
  bins: DistributionMetricFrame["bins"],
  aggregation: RunAggregation,
): number | null {
  switch (aggregation) {
    case "mean":
      return meanFromBins(bins);
    case "median":
      return percentileFromBins(bins, 0.5);
    case "min":
      return minFromBins(bins);
    case "max":
      return maxFromBins(bins);
    case "p10":
      return percentileFromBins(bins, 0.1);
    case "p25":
      return percentileFromBins(bins, 0.25);
    case "p75":
      return percentileFromBins(bins, 0.75);
    case "p90":
      return percentileFromBins(bins, 0.9);
  }
}

// The unaggregated "Percentile lines" view overlays a mean line with a handful
// of percentile lines so the spread of runs stays readable as a few lines
// rather than a single collapsed value.
const distributionBandSeries: {
  label: string;
  // `null` => arithmetic mean; otherwise the percentile fraction in [0, 1].
  fraction: number | null;
  stroke: string;
  width: number;
  dash?: number[];
}[] = [
  { label: "10th", fraction: 0.1, stroke: "#9ca3af", width: 1, dash: [3, 3] },
  { label: "25th", fraction: 0.25, stroke: "#6b7280", width: 1 },
  { label: "Median", fraction: 0.5, stroke: "#111827", width: 1.5 },
  { label: "Mean", fraction: null, stroke: "#d97706", width: 2 },
  { label: "75th", fraction: 0.75, stroke: "#6b7280", width: 1 },
  { label: "90th", fraction: 0.9, stroke: "#9ca3af", width: 1, dash: [3, 3] },
];

const distributionBandLegend: {
  label: string;
  stroke: string;
  dash: boolean;
}[] = [
  { label: "Mean", stroke: "#d97706", dash: false },
  { label: "Median", stroke: "#111827", dash: false },
  { label: "25–75%", stroke: "#6b7280", dash: false },
  { label: "10–90%", stroke: "#9ca3af", dash: true },
];

function bandValueFromBins(
  bins: DistributionMetricFrame["bins"],
  fraction: number | null,
): number | null {
  return fraction === null
    ? meanFromBins(bins)
    : percentileFromBins(bins, fraction);
}

function distributionFramesFrom(
  frames: readonly MetricFrame[],
): DistributionMetricFrame[] {
  return frames.filter(isDistributionMetricFrame);
}

function binValueRange(
  frames: readonly MetricFrame[],
): [number, number] | null {
  let low: number | null = null;
  let high: number | null = null;

  for (const frame of distributionFramesFrom(frames)) {
    for (const [value] of frame.bins) {
      low = low === null ? value : Math.min(low, value);
      high = high === null ? value : Math.max(high, value);
    }
  }

  return low === null || high === null ? null : [low, high];
}

// Paints every bin of every distribution frame as a rectangle whose opacity
// scales with its frequency — a heatmap of the full run distribution over time,
// used when run values are shown without any aggregation.
function createDistributionHeatmapPlugin(framesRef: {
  current: readonly MetricFrame[];
}): uPlot.Plugin {
  return {
    hooks: {
      draw: (u) => {
        const frames = distributionFramesFrom(framesRef.current);
        if (frames.length === 0) {
          return;
        }

        const ctx = u.ctx;
        const pr = uPlot.pxRatio;

        ctx.save();
        ctx.beginPath();
        ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
        ctx.clip();

        for (let i = 0; i < frames.length; i++) {
          const frame = frames[i]!;
          const xPos = u.valToPos(frame.time, "x", true);
          const prevFrame = frames[i - 1];
          const nextFrame = frames[i + 1];
          const leftGap = prevFrame
            ? Math.abs(xPos - u.valToPos(prevFrame.time, "x", true))
            : Infinity;
          const rightGap = nextFrame
            ? Math.abs(xPos - u.valToPos(nextFrame.time, "x", true))
            : Infinity;
          const xGap = Math.min(leftGap, rightGap);
          const width = Math.max(
            2 * pr,
            Number.isFinite(xGap) ? xGap : 10 * pr,
          );

          const { bins } = frame;
          let frameMaxFrequency = 0;
          for (const [, frequency] of bins) {
            frameMaxFrequency = Math.max(frameMaxFrequency, frequency);
          }
          if (frameMaxFrequency === 0) {
            continue;
          }

          for (let j = 0; j < bins.length; j++) {
            const [value, frequency] = bins[j]!;
            if (frequency <= 0) {
              continue;
            }

            const yPos = u.valToPos(value, "y", true);
            const aboveBin = bins[j + 1];
            const belowBin = bins[j - 1];
            const aboveGap = aboveBin
              ? Math.abs(yPos - u.valToPos(aboveBin[0], "y", true))
              : Infinity;
            const belowGap = belowBin
              ? Math.abs(yPos - u.valToPos(belowBin[0], "y", true))
              : Infinity;
            const yGap = Math.min(aboveGap, belowGap);
            const height = Math.max(
              2 * pr,
              Number.isFinite(yGap) ? yGap : 8 * pr,
            );

            // Opacity is relative to the densest bin in this frame, so the
            // mode reads as fully opaque and the surrounding spread fades off
            // — making it clear where each column's distribution concentrates,
            // regardless of how many bins the runs are split across.
            const alpha = frequency / frameMaxFrequency;
            ctx.fillStyle = `rgba(17, 24, 39, ${alpha})`;
            ctx.fillRect(xPos - width / 2, yPos - height / 2, width, height);
          }
        }

        ctx.restore();
      },
    },
  };
}

function applyTimeTrace(
  values: readonly (number | null)[],
  trace: TimeTrace,
): (number | null)[] {
  if (trace === "value") {
    return [...values];
  }

  let accumulated: number | null = null;

  return values.map((value) => {
    if (value !== null) {
      accumulated =
        accumulated === null
          ? value
          : trace === "minToDate"
            ? Math.min(accumulated, value)
            : Math.max(accumulated, value);
    }

    return accumulated;
  });
}

function reduceOverTime(
  values: readonly (number | null)[],
  aggregation: TimeAggregation,
): number | null {
  let count = 0;
  let sum = 0;
  let min: number | null = null;
  let max: number | null = null;

  for (const value of values) {
    if (value !== null) {
      count++;
      sum += value;
      min = min === null ? value : Math.min(min, value);
      max = max === null ? value : Math.max(max, value);
    }
  }

  if (count === 0) {
    return null;
  }

  switch (aggregation) {
    case "mean":
      return sum / count;
    case "min":
      return min;
    case "max":
      return max;
    case "sum":
      return sum;
  }
}

// Aggregating a series of distributions over time yields a single
// distribution: for each value, its frequency across every frame is reduced
// with the chosen aggregator (sum pools all runs, mean is the per-frame
// average, min/max are the smallest/largest frequency ever seen).
function aggregateDistributionOverTime(
  frames: readonly DistributionMetricFrame[],
  aggregation: TimeAggregation,
): DistributionMetricFrame["bins"] {
  const frameCount = frames.length;
  if (frameCount === 0) {
    return [];
  }

  const perValue = new Map<
    number,
    { sum: number; min: number; max: number; present: number }
  >();

  for (const frame of frames) {
    for (const [value, frequency] of frame.bins) {
      const entry = perValue.get(value) ?? {
        sum: 0,
        min: Infinity,
        max: 0,
        present: 0,
      };
      entry.sum += frequency;
      entry.min = Math.min(entry.min, frequency);
      entry.max = Math.max(entry.max, frequency);
      entry.present += 1;
      perValue.set(value, entry);
    }
  }

  const bins: [number, number][] = [];
  for (const [value, entry] of perValue) {
    let frequency: number;
    switch (aggregation) {
      case "sum":
        frequency = entry.sum;
        break;
      case "mean":
        frequency = entry.sum / frameCount;
        break;
      // A value absent from some frames implicitly had a frequency of 0 there.
      case "min":
        frequency = entry.present < frameCount ? 0 : entry.min;
        break;
      case "max":
        frequency = entry.max;
        break;
    }
    bins.push([value, frequency]);
  }

  return bins.sort(([a], [b]) => a - b);
}

function buildDistributionBarData(
  bins: DistributionMetricFrame["bins"],
): uPlot.AlignedData {
  const values: number[] = [];
  const frequencies: number[] = [];

  for (const [value, frequency] of bins) {
    values.push(value);
    frequencies.push(frequency);
  }

  return [values, frequencies] as uPlot.AlignedData;
}

const distributionBarsPath = uPlot.paths.bars?.({
  size: [0.85, Infinity],
  align: 0,
});

// A vertical bar chart of an aggregated distribution: value on the x-axis,
// aggregated frequency as the bar height.
function distributionBarChartOptions(
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

function buildScalarMetricTimelineData(
  frames: readonly ScalarMetricFrame[],
  timeTrace: TimeTrace,
): uPlot.AlignedData {
  const time: number[] = [];
  const values: (number | null)[] = [];

  for (const frame of frames) {
    time.push(frame.time);
    values.push(frame.value);
  }

  return [time, applyTimeTrace(values, timeTrace)] as uPlot.AlignedData;
}

function buildDistributionSingleData(
  frames: readonly DistributionMetricFrame[],
  runAggregation: RunAggregation,
  timeTrace: TimeTrace,
): uPlot.AlignedData {
  const time: number[] = [];
  const values: (number | null)[] = [];

  for (const frame of frames) {
    time.push(frame.time);
    values.push(aggregateDistributionBins(frame.bins, runAggregation));
  }

  return [time, applyTimeTrace(values, timeTrace)] as uPlot.AlignedData;
}

function buildDistributionHeatmapData(
  frames: readonly DistributionMetricFrame[],
): uPlot.AlignedData {
  // The raw distribution is painted by the heatmap plugin, so the line series
  // carries no values — but it still provides the x positions for the chart.
  const time = frames.map((frame) => frame.time);

  return [time, time.map(() => null)] as uPlot.AlignedData;
}

function buildDistributionBandsData(
  frames: readonly DistributionMetricFrame[],
  timeTrace: TimeTrace,
): uPlot.AlignedData {
  const time: number[] = [];
  const columns = distributionBandSeries.map(() => [] as (number | null)[]);

  for (const frame of frames) {
    time.push(frame.time);
    distributionBandSeries.forEach((band, index) => {
      columns[index]!.push(bandValueFromBins(frame.bins, band.fraction));
    });
  }

  return [
    time,
    ...columns.map((column) => applyTimeTrace(column, timeTrace)),
  ] as uPlot.AlignedData;
}

function buildMetricTimelineData(
  frames: readonly MetricFrame[],
  outputType: MetricFrame["outputType"],
  aggregateRuns: boolean,
  runAggregation: RunAggregation,
  distributionView: DistributionView,
  timeTrace: TimeTrace,
): uPlot.AlignedData {
  if (outputType !== "distribution") {
    return buildScalarMetricTimelineData(
      frames.filter(isScalarMetricFrame),
      timeTrace,
    );
  }

  const distributionFrames = frames.filter(isDistributionMetricFrame);

  if (aggregateRuns) {
    return buildDistributionSingleData(
      distributionFrames,
      runAggregation,
      timeTrace,
    );
  }

  return distributionView === "heatmap"
    ? buildDistributionHeatmapData(distributionFrames)
    : buildDistributionBandsData(distributionFrames, timeTrace);
}

function createEmptyMetricTimelineData(): uPlot.AlignedData {
  return [[], []] as uPlot.AlignedData;
}

function chartOptions(
  width: number,
  height: number,
  outputType: MetricFrame["outputType"],
  aggregateRuns: boolean,
  runAggregation: RunAggregation,
  distributionView: DistributionView,
  timeTrace: TimeTrace,
  framesRef: { current: readonly MetricFrame[] },
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
    plugins: isHeatmap ? [createDistributionHeatmapPlugin(framesRef)] : [],
    cursor: {
      drag: { x: false, y: false, setScale: false },
      lock: true,
    },
    legend: {
      show: false,
    },
    scales: {
      x: { time: false },
      y: {
        range: (_u, min, max) => {
          if (isHeatmap) {
            const range = binValueRange(framesRef.current);

            return range ? rangeWithBaseline(range[0], range[1]) : [0, 1];
          }

          if (!Number.isFinite(min) || !Number.isFinite(max)) {
            return [0, 1];
          }

          return rangeWithBaseline(min, max);
        },
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

const runAggregationOptions: { value: RunAggregation; label: string }[] = [
  { value: "mean", label: "Average" },
  { value: "median", label: "Median" },
  { value: "min", label: "Minimum" },
  { value: "max", label: "Maximum" },
  { value: "p10", label: "10th percentile" },
  { value: "p25", label: "25th percentile" },
  { value: "p75", label: "75th percentile" },
  { value: "p90", label: "90th percentile" },
] as const;

const distributionViewOptions: { value: DistributionView; label: string }[] = [
  { value: "heatmap", label: "Heatmap" },
  { value: "bands", label: "Percentile lines" },
] as const;

const timeTraceOptions: { value: TimeTrace; label: string }[] = [
  { value: "value", label: "Value" },
  { value: "minToDate", label: "Minimum to date" },
  { value: "maxToDate", label: "Maximum to date" },
] as const;

const timeAggregationOptions: { value: TimeAggregation; label: string }[] = [
  { value: "mean", label: "Average" },
  { value: "min", label: "Minimum" },
  { value: "max", label: "Maximum" },
  { value: "sum", label: "Sum" },
] as const;

function formatLatestMetricValue(value: number | null): string {
  return value === null ? "n/a" : formatNumber(value);
}

const BinHistogramRows = ({
  bins,
}: {
  bins: DistributionMetricFrame["bins"];
}) => {
  const maxFrequency = Math.max(0, ...bins.map(([, frequency]) => frequency));

  return (
    <div className={histogramRowsStyle}>
      {bins.map(([value, frequency]) => {
        const width =
          maxFrequency === 0
            ? 0
            : Math.max(2, (frequency / maxFrequency) * 100);

        return (
          <div key={value} className={histogramRowStyle}>
            <span className={histogramValueStyle} title={formatNumber(value)}>
              {formatNumber(value)}
            </span>
            <div className={histogramTrackStyle}>
              <div
                className={histogramBarStyle}
                style={{ width: `${width}%` }}
              />
            </div>
            <span className={histogramFrequencyStyle}>
              {formatNumber(frequency)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const DistributionFrameHistogram = ({
  frame,
}: {
  frame: DistributionMetricFrame;
}) => {
  const sampleCount = sampleCountFromBins(frame.bins);

  return (
    <div className={frameDetailStyle}>
      <div className={frameDetailHeaderStyle}>
        <span className={frameDetailTitleStyle}>
          {formatNumber(frame.time)}s
        </span>
        <span className={frameDetailMetaStyle}>
          Frame {frame.frameNumber} - {sampleCount} sample
          {sampleCount === 1 ? "" : "s"} - {frame.bins.length} bin
          {frame.bins.length === 1 ? "" : "s"}
        </span>
      </div>
      <BinHistogramRows bins={frame.bins} />
    </div>
  );
};

const ScalarFrameDetail = ({ frame }: { frame: ScalarMetricFrame }) => (
  <div className={frameDetailStyle}>
    <div className={frameDetailHeaderStyle}>
      <span className={frameDetailTitleStyle}>{formatNumber(frame.time)}s</span>
      <span className={frameDetailMetaStyle}>
        Frame {frame.frameNumber} - {frame.runSampleCount} run
        {frame.runSampleCount === 1 ? "" : "s"}
      </span>
    </div>
    <div className={scalarFrameValueStyle}>
      {frame.value === null ? "n/a" : formatNumber(frame.value)}
    </div>
  </div>
);

export const ExperimentMetricTimeline = ({
  frames,
  displaySize,
  onDisplaySizeChange,
}: {
  frames: readonly MetricFrame[];
  displaySize: MetricSize;
  onDisplaySizeChange: (size: MetricSize) => void;
}) => {
  const portalContainerRef = usePortalContainerRef();
  const chartRootRef = useRef<HTMLDivElement>(null);
  const framePopoverRef = useRef<HTMLDivElement>(null);
  const framePopoverHeightRef = useRef(FRAME_POPOVER_MAX_HEIGHT);
  const lastFramePopoverPointerRef = useRef<FramePopoverPointer | null>(null);
  const plotRef = useRef<uPlot | null>(null);
  const size = useElementSize(chartRootRef, { debounce: 50 });
  const [selectedFrameKey, setSelectedFrameKey] =
    useState<SelectedFrameKey | null>(null);
  const [framePopoverPosition, setFramePopoverPosition] =
    useState<FramePopoverPosition | null>(null);
  const [aggregateRuns, setAggregateRuns] = useState(false);
  const [runAggregation, setRunAggregation] = useState<RunAggregation>("mean");
  const [distributionView, setDistributionView] =
    useState<DistributionView>("heatmap");
  const [aggregateTime, setAggregateTime] = useState(false);
  const [timeTrace, setTimeTrace] = useState<TimeTrace>("value");
  const [timeAggregation, setTimeAggregation] =
    useState<TimeAggregation>("mean");
  const latestFrame = frames.at(-1);
  const outputType = latestFrame?.outputType ?? "scalar";
  const selectedFrame = selectedFrameKey
    ? (frames.find(
        (frame) =>
          frame.metricId === selectedFrameKey.metricId &&
          frame.frameNumber === selectedFrameKey.frameNumber &&
          frame.time === selectedFrameKey.time,
      ) ?? null)
    : null;
  const isDistribution = outputType === "distribution";
  // A scalar series (scalar metric, or a distribution with runs aggregated)
  // collapses to one number when aggregating over time; an unaggregated
  // distribution instead collapses to a single aggregated distribution.
  const scalarLike = !isDistribution || aggregateRuns;
  const displayMode = aggregateTime
    ? scalarLike
      ? "number"
      : "distribution"
    : "chart";
  const isChart = displayMode === "chart";
  const showsSpread = isChart && isDistribution && !aggregateRuns;
  const isBands = showsSpread && distributionView === "bands";
  const data = buildMetricTimelineData(
    frames,
    outputType,
    aggregateRuns,
    runAggregation,
    distributionView,
    timeTrace,
  );
  const aggregateNumber =
    displayMode === "number"
      ? reduceOverTime(
          frames.map((frame) =>
            frame.outputType === "scalar"
              ? frame.value
              : aggregateDistributionBins(frame.bins, runAggregation),
          ),
          timeAggregation,
        )
      : null;
  // The timeline and the aggregated-distribution bar chart share one uPlot
  // instance; only the single-number display opts out of plotting.
  const plotData =
    displayMode === "distribution"
      ? buildDistributionBarData(
          aggregateDistributionOverTime(
            distributionFramesFrom(frames),
            timeAggregation,
          ),
        )
      : data;
  const usesPlot = displayMode !== "number";
  const latestDataRef = useRef(plotData);
  const latestFramesRef = useRef(frames);
  const hasPlotData = plotData[0]!.length > 0;

  useEffect(() => {
    latestDataRef.current = plotData;
  }, [plotData]);

  useEffect(() => {
    latestFramesRef.current = frames;
  }, [frames]);

  useEffect(() => {
    const root = chartRootRef.current;
    if (!root || !size || !hasPlotData || !usesPlot) {
      plotRef.current?.destroy();
      plotRef.current = null;
      root?.replaceChildren();
      return;
    }

    plotRef.current?.destroy();
    root.replaceChildren();
    const plot = new UPlot(
      displayMode === "distribution"
        ? distributionBarChartOptions(size.width, Math.max(220, size.height))
        : chartOptions(
            size.width,
            Math.max(220, size.height),
            outputType,
            aggregateRuns,
            runAggregation,
            distributionView,
            timeTrace,
            latestFramesRef,
          ),
      createEmptyMetricTimelineData(),
      root,
    );
    plot.setData(latestDataRef.current);
    plotRef.current = plot;

    // Click-to-inspect only applies to the per-frame timeline, not the
    // aggregated-distribution bar chart (which has no time axis).
    if (displayMode !== "chart") {
      return () => {
        plotRef.current = null;
        plot.destroy();
      };
    }

    const selectFrameAtPointer = (event: PointerEvent) => {
      const overRect = plot.over.getBoundingClientRect();
      const x = clamp(event.clientX - overRect.left, 0, overRect.width);
      const idx = plot.posToIdx(x, false);
      const frame = latestFramesRef.current[idx];

      if (frame) {
        const pointer = {
          clientX: event.clientX,
          clientY: event.clientY,
        };

        lastFramePopoverPointerRef.current = pointer;
        setSelectedFrameKey({
          metricId: frame.metricId,
          frameNumber: frame.frameNumber,
          time: frame.time,
        });
        setFramePopoverPosition(
          getFramePopoverPosition(pointer, framePopoverHeightRef.current),
        );
      }
    };
    let dragging = false;

    const handlePointerDown = (event: PointerEvent) => {
      dragging = true;
      plot.over.setPointerCapture(event.pointerId);
      selectFrameAtPointer(event);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (dragging) {
        selectFrameAtPointer(event);
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!dragging) {
        return;
      }

      dragging = false;
      if (plot.over.hasPointerCapture(event.pointerId)) {
        plot.over.releasePointerCapture(event.pointerId);
      }
    };

    plot.over.addEventListener("pointerdown", handlePointerDown);
    plot.over.addEventListener("pointermove", handlePointerMove);
    plot.over.addEventListener("pointerup", handlePointerUp);
    plot.over.addEventListener("pointercancel", handlePointerUp);

    return () => {
      plot.over.removeEventListener("pointerdown", handlePointerDown);
      plot.over.removeEventListener("pointermove", handlePointerMove);
      plot.over.removeEventListener("pointerup", handlePointerUp);
      plot.over.removeEventListener("pointercancel", handlePointerUp);
      plotRef.current = null;
      plot.destroy();
    };
  }, [
    aggregateRuns,
    displayMode,
    distributionView,
    hasPlotData,
    outputType,
    runAggregation,
    size,
    timeTrace,
    usesPlot,
  ]);

  useEffect(() => {
    if (!plotRef.current) {
      return;
    }

    plotRef.current.setData(plotData);
  }, [plotData]);

  useEffect(() => {
    if (!selectedFrameKey) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (
        framePopoverRef.current?.contains(target) ||
        chartRootRef.current?.contains(target)
      ) {
        return;
      }

      setSelectedFrameKey(null);
      setFramePopoverPosition(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [selectedFrameKey]);

  useLayoutEffect(() => {
    const height = framePopoverRef.current?.getBoundingClientRect().height;

    if (
      height === undefined ||
      Math.abs(framePopoverHeightRef.current - height) < 1
    ) {
      return;
    }

    framePopoverHeightRef.current = height;

    const pointer = lastFramePopoverPointerRef.current;

    if (pointer) {
      setFramePopoverPosition(getFramePopoverPosition(pointer, height));
    }
  }, [selectedFrame, framePopoverPosition]);

  if (!latestFrame) {
    return <div className={emptyStyle}>Waiting for metric data</div>;
  }

  const framePopover =
    isChart && selectedFrame && framePopoverPosition ? (
      <Portal container={portalContainerRef}>
        <div
          ref={framePopoverRef}
          className={framePopoverStyle}
          data-placement={framePopoverPosition.placement}
          role="dialog"
          aria-label={
            selectedFrame.outputType === "distribution"
              ? `Distribution at ${formatNumber(selectedFrame.time)}s`
              : `Value at ${formatNumber(selectedFrame.time)}s`
          }
          style={
            {
              "--frame-popover-x": `${framePopoverPosition.x}px`,
              "--frame-popover-y": `${framePopoverPosition.y}px`,
            } as CSSProperties
          }
        >
          <Button
            className={framePopoverCloseStyle}
            variant="ghost"
            size="xxs"
            iconName="close"
            aria-label="Close"
            tooltip="Close"
            onClick={() => {
              setSelectedFrameKey(null);
              setFramePopoverPosition(null);
            }}
          />
          {selectedFrame.outputType === "distribution" ? (
            <DistributionFrameHistogram frame={selectedFrame} />
          ) : (
            <ScalarFrameDetail frame={selectedFrame} />
          )}
        </div>
      </Portal>
    ) : null;

  return (
    <div className={rootStyle}>
      <div className={headerStyle}>
        <span className={titleStyle}>{latestFrame.label}</span>
        <div className={headerRightStyle}>
          <Button
            variant="ghost"
            size="xs"
            iconName={displaySize === "large" ? "collapse" : "expand"}
            aria-label={displaySize === "large" ? "Half width" : "Full width"}
            tooltip={displaySize === "large" ? "Half width" : "Full width"}
            onClick={() =>
              onDisplaySizeChange(displaySize === "large" ? "small" : "large")
            }
          />
        </div>
      </div>
      {displayMode === "number" ? (
        <div className={aggregateNumberStyle}>
          {formatLatestMetricValue(aggregateNumber)}
        </div>
      ) : (
        <div ref={chartRootRef} className={chartStyle} />
      )}
      {isBands ? (
        <div className={legendStyle}>
          {distributionBandLegend.map((item) => (
            <span key={item.label} className={legendItemStyle}>
              <span
                className={legendSwatchStyle}
                style={{
                  borderTop: `2px ${item.dash ? "dashed" : "solid"} ${item.stroke}`,
                }}
              />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
      <div className={footerStyle}>
        {isDistribution ? (
          <div className={footerBlockStyle}>
            <div className={aggregationControlStyle}>
              <span className={aggregationLabelStyle}>Aggregate runs</span>
              <Switch
                checked={aggregateRuns}
                onCheckedChange={setAggregateRuns}
              />
            </div>
            {aggregateRuns ? (
              <Select
                value={runAggregation}
                onValueChange={(value) =>
                  setRunAggregation(value as RunAggregation)
                }
                options={runAggregationOptions}
                size="xs"
                className={aggregationSelectStyle}
                portal={false}
              />
            ) : (
              <Select
                value={distributionView}
                onValueChange={(value) =>
                  setDistributionView(value as DistributionView)
                }
                options={distributionViewOptions}
                size="xs"
                className={aggregationSelectStyle}
                portal={false}
              />
            )}
          </div>
        ) : null}
        <div className={footerBlockRightStyle}>
          <div className={aggregationControlStyle}>
            <span className={aggregationLabelStyle}>Aggregate over time</span>
            <Switch
              checked={aggregateTime}
              onCheckedChange={setAggregateTime}
            />
          </div>
          {aggregateTime ? (
            <Select
              value={timeAggregation}
              onValueChange={(value) =>
                setTimeAggregation(value as TimeAggregation)
              }
              options={timeAggregationOptions}
              size="xs"
              className={aggregationSelectStyle}
              portal={false}
            />
          ) : (
            <Select
              value={timeTrace}
              onValueChange={(value) => setTimeTrace(value as TimeTrace)}
              options={timeTraceOptions}
              size="xs"
              className={aggregationSelectStyle}
              portal={false}
            />
          )}
        </div>
      </div>
      {framePopover}
    </div>
  );
};
