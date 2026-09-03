/**
 * @layerRoot ui.views.editor.metric-timeline
 * @role Charts one experiment metric over time — line, percentile bands,
 * density heatmap, or aggregates — as frames stream in
 */
import { useRef, useState } from "react";

import { Button, Select, Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import "uplot/dist/uPlot.min.css";

import { useElementSize } from "../../../../../../react/hooks/use-element-size";
import { FramePopover } from "./experiment-metric-timeline/frame-popover";
import {
  buildDistributionBarData,
  buildMetricTimelineData,
} from "./experiment-metric-timeline/plot-data";
import { distributionBandLegend } from "./experiment-metric-timeline/shared/distribution-bands";
import {
  aggregateDistributionBins,
  aggregateDistributionOverTime,
  reduceOverTime,
} from "./experiment-metric-timeline/shared/distribution-math";
import {
  distributionFramesFrom,
  formatNumber,
} from "./experiment-metric-timeline/shared/metric-frames";
import { useMetricPlot } from "./experiment-metric-timeline/use-metric-plot";

export type { PlotCrossfade } from "./experiment-metric-timeline/use-metric-plot";

import type { FramePopoverPointer } from "./experiment-metric-timeline/frame-popover";
import type {
  DistributionView,
  RunAggregation,
  TimeAggregation,
  TimeTrace,
} from "./experiment-metric-timeline/shared/distribution-math";
import type { MetricFrame } from "./experiment-metric-timeline/shared/metric-frames";

// "large" fills the container width (default), "small" takes half the width.
export type MetricSize = "small" | "large";

type SelectedFrameKey = {
  metricId: string;
  frameNumber: number;
  time: number;
};

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

// Wraps the chart root so the waiting overlay can sit on top of the (fixed
// height) plot area without living inside it — the plot effect replaces the
// chart root's children wholesale.
const chartFrameStyle = css({
  position: "relative",
});

const chartWaitingStyle = css({
  position: "absolute",
  inset: "[0]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "sm",
  color: "neutral.s80",
  pointerEvents: "none",
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

const runAggregationOptions: { value: RunAggregation; text: string }[] = [
  { value: "mean", text: "Average" },
  { value: "median", text: "Median" },
  { value: "min", text: "Minimum" },
  { value: "max", text: "Maximum" },
  { value: "p10", text: "10th percentile" },
  { value: "p25", text: "25th percentile" },
  { value: "p75", text: "75th percentile" },
  { value: "p90", text: "90th percentile" },
] as const;

const distributionViewOptions: { value: DistributionView; text: string }[] = [
  { value: "heatmap", text: "Heatmap" },
  { value: "bands", text: "Percentile lines" },
] as const;

const timeTraceOptions: { value: TimeTrace; text: string }[] = [
  { value: "value", text: "Value" },
  { value: "minToDate", text: "Minimum to date" },
  { value: "maxToDate", text: "Maximum to date" },
] as const;

const timeAggregationOptions: { value: TimeAggregation; text: string }[] = [
  { value: "mean", text: "Average" },
  { value: "min", text: "Minimum" },
  { value: "max", text: "Maximum" },
  { value: "sum", text: "Sum" },
] as const;

export const ExperimentMetricTimeline = ({
  frames,
  displaySize,
  onDisplaySizeChange,
  label,
  timeDomain,
  contentEpoch,
  crossfade,
}: {
  frames: readonly MetricFrame[];
  displaySize: MetricSize;
  onDisplaySizeChange: (size: MetricSize) => void;
  /**
   * Title shown before any frame arrives. With it, the component keeps its
   * full shell — header, fixed-height plot area, footer — while empty, so
   * data arriving (or a re-stream clearing the frames) causes no layout
   * shift. Without it, an empty component renders a plain placeholder.
   */
  label?: string;
  /**
   * Pins the x axis to this time window (typically `[0, maxTime]`). Without
   * it the axis fits the streamed frames and rescales as they arrive.
   */
  timeDomain?: readonly [number, number];
  /**
   * Identity of what the frames represent (a sweep's selection key). A
   * change crossfades the previous picture out; see `PlotCrossfade`.
   */
  contentEpoch?: string;
  crossfade?: import("./experiment-metric-timeline/use-metric-plot").PlotCrossfade;
}) => {
  const chartRootRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(chartRootRef, { debounce: 50 });
  const [selectedFrameKey, setSelectedFrameKey] =
    useState<SelectedFrameKey | null>(null);
  const [popoverPointer, setPopoverPointer] =
    useState<FramePopoverPointer | null>(null);
  const [aggregateRuns, setAggregateRuns] = useState(false);
  const [runAggregation, setRunAggregation] = useState<RunAggregation>("mean");
  const [distributionView, setDistributionView] =
    useState<DistributionView>("heatmap");
  const [aggregateTime, setAggregateTime] = useState(false);
  const [timeTrace, setTimeTrace] = useState<TimeTrace>("value");
  const [timeAggregation, setTimeAggregation] =
    useState<TimeAggregation>("mean");
  const latestFrame = frames.at(-1);
  // A re-stream (parameters changed) briefly empties the frames; remembering
  // the last output type keeps the footer controls and chart shape stable
  // instead of flickering through the scalar defaults.
  const [lastOutputType, setLastOutputType] = useState<
    MetricFrame["outputType"] | null
  >(null);
  if (latestFrame && latestFrame.outputType !== lastOutputType) {
    setLastOutputType(latestFrame.outputType);
  }
  const outputType = latestFrame?.outputType ?? lastOutputType ?? "scalar";
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
      : buildMetricTimelineData(
          frames,
          outputType,
          aggregateRuns,
          runAggregation,
          distributionView,
          timeTrace,
        );
  const timeDomainStart = timeDomain?.[0];
  const timeDomainEnd = timeDomain?.[1];
  const hasPlotData = plotData[0]!.length > 0;
  // Once a metric has shown data, an empty re-stream keeps the plot mounted
  // (axes and grid intact) rather than falling back to the waiting state —
  // possible only with a pinned time domain, since empty data pins nothing.
  const hasEverHadData = lastOutputType !== null;
  const keepsAxesWhileEmpty =
    hasEverHadData &&
    timeDomainStart !== undefined &&
    timeDomainEnd !== undefined;
  const canPlot =
    displayMode !== "number" && (hasPlotData || keepsAxesWhileEmpty);

  useMetricPlot({
    chartRootRef,
    size,
    canPlot,
    displayMode,
    outputType,
    aggregateRuns,
    runAggregation,
    distributionView,
    timeTrace,
    timeDomainStart,
    timeDomainEnd,
    frames,
    plotData,
    ...(contentEpoch === undefined ? {} : { contentEpoch }),
    ...(crossfade === undefined ? {} : { crossfade }),
    onFrameSelect: (frame, pointer) => {
      setSelectedFrameKey({
        metricId: frame.metricId,
        frameNumber: frame.frameNumber,
        time: frame.time,
      });
      setPopoverPointer(pointer);
    },
  });

  if (!latestFrame && label === undefined) {
    return <div className={emptyStyle}>Waiting for metric data</div>;
  }

  return (
    <div className={rootStyle}>
      <div className={headerStyle}>
        <span className={titleStyle}>{latestFrame?.label ?? label}</span>
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
          {aggregateNumber === null ? "n/a" : formatNumber(aggregateNumber)}
        </div>
      ) : (
        <div className={chartFrameStyle}>
          <div ref={chartRootRef} className={chartStyle} />
          {hasPlotData || hasEverHadData ? null : (
            <div className={chartWaitingStyle}>Waiting for metric data</div>
          )}
        </div>
      )}
      {isBands ? (
        <div className={legendStyle}>
          {distributionBandLegend.map((item) => (
            <span key={item.label} className={legendItemStyle}>
              <span
                className={legendSwatchStyle}
                style={{
                  borderTop: `2px ${item.dash ? "dashed" : "solid"} ${
                    item.stroke
                  }`,
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
              <Toggle
                value={aggregateRuns}
                onChange={setAggregateRuns}
                size="xs"
              />
            </div>
            {aggregateRuns ? (
              <Select
                required
                value={runAggregation}
                onChange={setRunAggregation}
                items={runAggregationOptions}
                size="xs"
                className={aggregationSelectStyle}
              />
            ) : (
              <Select
                required
                value={distributionView}
                onChange={setDistributionView}
                items={distributionViewOptions}
                size="xs"
                className={aggregationSelectStyle}
              />
            )}
          </div>
        ) : null}
        <div className={footerBlockRightStyle}>
          <div className={aggregationControlStyle}>
            <span className={aggregationLabelStyle}>Aggregate over time</span>
            <Toggle
              value={aggregateTime}
              onChange={setAggregateTime}
              size="xs"
            />
          </div>
          {aggregateTime ? (
            <Select
              required
              value={timeAggregation}
              onChange={setTimeAggregation}
              items={timeAggregationOptions}
              size="xs"
              className={aggregationSelectStyle}
            />
          ) : (
            <Select
              required
              value={timeTrace}
              onChange={setTimeTrace}
              items={timeTraceOptions}
              size="xs"
              className={aggregationSelectStyle}
            />
          )}
        </div>
      </div>
      {isChart && selectedFrame && popoverPointer ? (
        <FramePopover
          frame={selectedFrame}
          pointer={popoverPointer}
          chartRootRef={chartRootRef}
          onClose={() => {
            setSelectedFrameKey(null);
            setPopoverPointer(null);
          }}
        />
      ) : null}
    </div>
  );
};
