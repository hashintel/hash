/**
 * Charts one experiment metric over time — line, percentile bands, density
 * heatmap, or aggregates — as frames stream in. Its private pieces in
 * `experiment-metric-timeline/` form the metric-timeline layer.
 */
import { useRef, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";
import "uplot/dist/uPlot.min.css";

import { useElementSize } from "../../../../../../react/hooks/use-element-size";
import { formatFixed } from "../shared/format-value";
import { FramePopover } from "./experiment-metric-timeline/frame-popover";
import { distributionBandLegend } from "./experiment-metric-timeline/shared/distribution-bands";
import { useMetricPlot } from "./experiment-metric-timeline/use-metric-plot";
import {
  deriveMetricViewState,
  selectedFrameFrom,
} from "./experiment-metric-timeline/view-state";

import type { MetricFrame } from "./experiment-metric-timeline/shared/metric-frames";
import type {
  FrameSelection,
  MetricViewSettings,
} from "./experiment-metric-timeline/view-state";

export { describeMetricView } from "./experiment-metric-timeline/describe-metric-view";
export { MetricViewMenu } from "./experiment-metric-timeline/metric-view-menu";
export {
  DEFAULT_METRIC_VIEW_SETTINGS,
  type MetricViewSettings,
} from "./experiment-metric-timeline/view-state";

// The component is exactly the plot's height: the waiting note and the
// legend sit on the frame as overlays, so no view setting adds a row.
const frameStyle = css({
  position: "relative",
  width: "full",
  minWidth: "[0]",
});

const chartStyle = css({
  width: "full",
  height: "full",
  minWidth: "[0]",
  _empty: {
    cursor: "default",
  },
  "& .u-over": {
    cursor: "crosshair",
    touchAction: "none",
  },
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

const legendStyle = css({
  position: "absolute",
  top: "1",
  right: "1",
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "flex-end",
  columnGap: "2.5",
  rowGap: "0.5",
  maxWidth: "[calc(100% - 48px)]",
  paddingX: "1.5",
  paddingY: "0.5",
  borderRadius: "sm",
  backgroundColor: "[rgba(255, 255, 255, 0.85)]",
  fontSize: "[11px]",
  color: "neutral.s90",
  pointerEvents: "none",
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

const aggregateNumberStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "full",
  height: "full",
  fontSize: "[44px]",
  fontWeight: "semibold",
  fontVariantNumeric: "tabular-nums",
  color: "neutral.s120",
});

const BandLegend = () => (
  <div className={legendStyle} data-band-legend>
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
);

export const ExperimentMetricTimeline = ({
  frames,
  settings,
  expectedOutputType,
  timeDomain,
  contentEpoch,
  plotHeight,
}: {
  frames: readonly MetricFrame[];
  /** How the runs and the time axis collapse; the owner holds it and offers the menu. */
  settings: MetricViewSettings;
  /**
   * The metric's declared output type, so the chart shape is right before
   * the first frame arrives instead of switching when it does.
   */
  expectedOutputType?: MetricFrame["outputType"];
  /**
   * Pins the x axis to this time window (typically `[0, maxTime]`). Without
   * it the axis fits the streamed frames and rescales as they arrive.
   */
  timeDomain?: readonly [number, number];
  /**
   * Identity of what the frames represent (a sweep's selection key). A
   * change crossfades the previous picture out instead of cutting.
   */
  contentEpoch?: string;
  /** The plot's height in pixels; the component is exactly this tall. */
  plotHeight: number;
}) => {
  const chartRootRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(chartRootRef, { debounce: 50 });
  const [selection, setSelection] = useState<FrameSelection | null>(null);
  const latestFrame = frames.at(-1);
  // A re-stream briefly empties the frames; the remembered output type keeps
  // the chart shape from flickering through the scalar defaults.
  const [lastOutputType, setLastOutputType] = useState<
    MetricFrame["outputType"] | null
  >(null);
  if (latestFrame && latestFrame.outputType !== lastOutputType) {
    setLastOutputType(latestFrame.outputType);
  }
  const outputType =
    latestFrame?.outputType ?? lastOutputType ?? expectedOutputType ?? "scalar";
  const timeDomainStart = timeDomain?.[0];
  const timeDomainEnd = timeDomain?.[1];
  const view = deriveMetricViewState({
    frames,
    outputType,
    settings,
    keepsAxesWhileEmpty:
      timeDomainStart !== undefined && timeDomainEnd !== undefined,
  });
  const selectedFrame = selection ? selectedFrameFrom(frames, selection) : null;

  useMetricPlot({
    chartRootRef,
    size,
    canPlot: view.canPlot,
    displayMode: view.displayMode,
    outputType,
    aggregateRuns: settings.aggregateRuns,
    runAggregation: settings.runAggregation,
    distributionView: settings.distributionView,
    timeTrace: settings.timeTrace,
    timeDomainStart,
    timeDomainEnd,
    frames,
    plotData: view.plotData,
    contentEpoch,
    onFrameSelect: (pick) =>
      setSelection({
        index: pick.index,
        frameNumber: pick.frame.frameNumber,
        pointer: pick.pointer,
      }),
  });

  return (
    <div
      className={frameStyle}
      style={{ height: plotHeight, minHeight: plotHeight }}
    >
      {view.displayMode === "number" ? (
        <div className={aggregateNumberStyle}>
          {view.aggregateNumber === null
            ? "n/a"
            : formatFixed(view.aggregateNumber)}
        </div>
      ) : (
        <>
          <div ref={chartRootRef} className={chartStyle} />
          {view.hasPlotData || lastOutputType !== null ? null : (
            <div className={chartWaitingStyle}>Waiting for metric data</div>
          )}
        </>
      )}
      {view.showsBandLegend ? <BandLegend /> : null}
      {view.displayMode === "chart" && selectedFrame && selection ? (
        <FramePopover
          frame={selectedFrame}
          pointer={selection.pointer}
          chartRootRef={chartRootRef}
          onClose={() => setSelection(null)}
        />
      ) : null}
    </div>
  );
};
