import { useEffect, useRef } from "react";
import uPlot from "uplot";

import { css } from "@hashintel/ds-helpers/css";
import "uplot/dist/uPlot.min.css";

import { useElementSize } from "../../../../../../react/hooks/use-element-size";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";

const UPlot = uPlot;

type MetricFrame = ExperimentRecord["metricFrames"][number];
type ScalarMetricFrame = Extract<MetricFrame, { outputType: "scalar" }>;
type DistributionMetricFrame = Extract<
  MetricFrame,
  { outputType: "distribution" }
>;

const rootStyle = css({
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

const titleStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.s120",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const latestValueStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s100",
  whiteSpace: "nowrap",
});

const chartStyle = css({
  height: "[260px]",
  minHeight: "[260px]",
  width: "full",
  minWidth: "[0]",
});

const footerStyle = css({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "3",
  rowGap: "2",
  fontSize: "xs",
  color: "neutral.s80",
});

const legendItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  fontWeight: "medium",
  color: "neutral.s100",
});

const legendSwatchStyle = css({
  width: "[18px]",
  height: "[0]",
  borderTopWidth: "[2px]",
});

const emptyStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "[160px]",
  fontSize: "sm",
  color: "neutral.s80",
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

function sampleCountFromBins(bins: DistributionMetricFrame["bins"]): number {
  return bins.reduce((sum, [, frequency]) => sum + frequency, 0);
}

function percentileFromBins(
  bins: DistributionMetricFrame["bins"],
  percentile: number,
): number | null {
  const sampleCount = sampleCountFromBins(bins);
  if (sampleCount === 0) {
    return null;
  }

  const targetRank = Math.ceil(sampleCount * percentile);
  let cumulative = 0;

  for (const [value, frequency] of bins) {
    cumulative += frequency;
    if (cumulative >= targetRank) {
      return value;
    }
  }

  return null;
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

function buildScalarMetricTimelineData(
  frames: readonly ScalarMetricFrame[],
): uPlot.AlignedData {
  const time: number[] = [];
  const values: (number | null)[] = [];

  for (const frame of frames) {
    time.push(frame.time);
    values.push(frame.value);
  }

  return [time, values] as uPlot.AlignedData;
}

function buildDistributionMetricTimelineData(
  frames: readonly DistributionMetricFrame[],
): uPlot.AlignedData {
  const time: number[] = [];
  const median: (number | null)[] = [];
  const mean: (number | null)[] = [];
  const p10: (number | null)[] = [];
  const p90: (number | null)[] = [];

  for (const frame of frames) {
    time.push(frame.time);
    median.push(percentileFromBins(frame.bins, 0.5));
    mean.push(meanFromBins(frame.bins));
    p10.push(percentileFromBins(frame.bins, 0.1));
    p90.push(percentileFromBins(frame.bins, 0.9));
  }

  return [time, median, mean, p10, p90] as uPlot.AlignedData;
}

function buildMetricTimelineData(
  frames: readonly MetricFrame[],
  outputType: MetricFrame["outputType"],
): uPlot.AlignedData {
  return outputType === "distribution"
    ? buildDistributionMetricTimelineData(
        frames.filter(isDistributionMetricFrame),
      )
    : buildScalarMetricTimelineData(frames.filter(isScalarMetricFrame));
}

function createEmptyMetricTimelineData(
  outputType: MetricFrame["outputType"],
): uPlot.AlignedData {
  return (
    outputType === "distribution" ? [[], [], [], [], []] : [[], []]
  ) as uPlot.AlignedData;
}

function chartOptions(
  width: number,
  height: number,
  outputType: MetricFrame["outputType"],
): uPlot.Options {
  return {
    width,
    height,
    pxAlign: false,
    padding: [0, 8, 4, null],
    cursor: {
      drag: { x: false, y: false, setScale: false },
    },
    legend: {
      show: false,
    },
    scales: {
      x: { time: false },
      y: {
        range: (_u, min, max) => {
          if (!Number.isFinite(min) || !Number.isFinite(max)) {
            return [0, 1];
          }

          if (min === max) {
            const padding = Math.max(1, Math.abs(max) * 0.05);

            return [Math.min(0, min - padding), max + padding];
          }

          return [Math.min(0, min), max];
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
    series: [
      {},
      ...(outputType === "distribution"
        ? [
            {
              label: "median",
              stroke: "#111827",
              width: 2,
            },
            {
              label: "mean",
              stroke: "#d97706",
              width: 2,
              dash: [8, 6],
            },
            {
              label: "p10",
              stroke: "#94a3b8",
              width: 1,
            },
            {
              label: "p90",
              stroke: "#94a3b8",
              width: 1,
            },
          ]
        : [
            {
              label: "value",
              stroke: "#111827",
              width: 2,
            },
          ]),
    ],
  };
}

const scalarLegendItems = [
  { label: "value", color: "#111827", dash: "solid" },
] as const;

const distributionLegendItems = [
  { label: "median", color: "#111827", dash: "solid" },
  { label: "mean", color: "#d97706", dash: "dashed" },
  { label: "p10", color: "#94a3b8", dash: "solid" },
  { label: "p90", color: "#94a3b8", dash: "solid" },
] as const;

function formatLatestMetricValue(frame: MetricFrame): string {
  if (frame.outputType === "distribution") {
    const median = percentileFromBins(frame.bins, 0.5);

    return median === null ? "n/a" : `median ${formatNumber(median)}`;
  }

  return frame.value === null ? "n/a" : formatNumber(frame.value);
}

function formatFrameSampleCount(frame: MetricFrame): string {
  const sampleCount =
    frame.outputType === "distribution"
      ? sampleCountFromBins(frame.bins)
      : frame.runSampleCount;

  return `${sampleCount} run${sampleCount === 1 ? "" : "s"}`;
}

export const ExperimentMetricTimeline = ({
  frames,
}: {
  frames: readonly MetricFrame[];
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const size = useElementSize(rootRef, { debounce: 50 });
  const latestFrame = frames.at(-1);
  const outputType = latestFrame?.outputType ?? "scalar";
  const data = buildMetricTimelineData(frames, outputType);
  const latestDataRef = useRef(data);
  const hasData = data[0]!.length > 0;
  const legendItems =
    outputType === "distribution" ? distributionLegendItems : scalarLegendItems;

  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !size || !hasData) {
      plotRef.current?.destroy();
      plotRef.current = null;
      root?.replaceChildren();
      return;
    }

    plotRef.current?.destroy();
    root.replaceChildren();
    const plot = new UPlot(
      chartOptions(size.width, Math.max(220, size.height), outputType),
      createEmptyMetricTimelineData(outputType),
      root,
    );
    plot.setData(latestDataRef.current);
    plotRef.current = plot;

    return () => {
      plotRef.current = null;
      plot.destroy();
    };
  }, [hasData, outputType, size]);

  useEffect(() => {
    if (!plotRef.current) {
      return;
    }

    plotRef.current.setData(data);
  }, [data]);

  if (!latestFrame) {
    return <div className={emptyStyle}>Waiting for metric data</div>;
  }

  return (
    <div className={rootStyle}>
      <div className={headerStyle}>
        <span className={titleStyle}>{latestFrame.label}</span>
        <span className={latestValueStyle}>
          {formatLatestMetricValue(latestFrame)}
        </span>
      </div>
      <div ref={rootRef} className={chartStyle} />
      <div className={footerStyle}>
        {legendItems.map((item) => (
          <span key={item.label} className={legendItemStyle}>
            <span
              className={legendSwatchStyle}
              style={{
                borderTopColor: item.color,
                borderTopStyle: item.dash,
              }}
            />
            {item.label}
          </span>
        ))}
        <span>
          Frame {latestFrame.frameNumber} -{" "}
          {formatFrameSampleCount(latestFrame)}
        </span>
      </div>
    </div>
  );
};
