/**
 * @layerRoot ui.views.editor.metric-timeline
 * @role Charts one experiment metric over time — line, percentile bands,
 * density heatmap, or aggregates — as frames stream in
 */
import { useRef, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import "uplot/dist/uPlot.min.css";

import { useElementSize } from "../../../../../../react/hooks/use-element-size";
import { FramePopover } from "./experiment-metric-timeline/frame-popover";
import { distributionBandLegend } from "./experiment-metric-timeline/shared/distribution-bands";
import { TimelineControls } from "./experiment-metric-timeline/timeline-controls";
import { useMetricPlot } from "./experiment-metric-timeline/use-metric-plot";
import {
  DEFAULT_METRIC_VIEW_SETTINGS,
  deriveMetricViewState,
  selectedFrameFrom,
} from "./experiment-metric-timeline/view-state";
import { formatNumber } from "./shared/format-number";

import type { MetricFrame } from "./experiment-metric-timeline/shared/metric-frames";
import type { FrameSelection } from "./experiment-metric-timeline/view-state";

/** "large" fills the container width, "small" takes half of it. */
export type MetricSize = "small" | "large";

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

/** The plot's height unless the owner sizes it. */
const DEFAULT_PLOT_HEIGHT = 260;

const chartStyle = css({
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

// The waiting overlay sits on this frame, not inside the chart root, whose
// children the plot owns.
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
  width: "full",
  fontSize: "[44px]",
  fontWeight: "semibold",
  fontVariantNumeric: "tabular-nums",
  color: "neutral.s120",
});

const BandLegend = () => (
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
);

export const ExperimentMetricTimeline = ({
  frames,
  displaySize,
  onDisplaySizeChange,
  label,
  expectedOutputType,
  timeDomain,
  contentEpoch,
  plotHeight = DEFAULT_PLOT_HEIGHT,
}: {
  frames: readonly MetricFrame[];
  displaySize: MetricSize;
  /** Toggles between the two sizes; absent when the chart's slot is fixed. */
  onDisplaySizeChange?: (size: MetricSize) => void;
  /**
   * Title shown before any frame arrives. With it, the component keeps its
   * full shell — header, fixed-height plot area, footer — while empty, so
   * data arriving (or a re-stream clearing the frames) causes no layout
   * shift. Without it, an empty component renders a plain placeholder.
   */
  label?: string;
  /**
   * The metric's declared output type, so the controls and chart shape are
   * right before the first frame arrives instead of switching when it does.
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
  /** The plot area's height in pixels; the header and controls add to it. */
  plotHeight?: number;
}) => {
  const chartRootRef = useRef<HTMLDivElement>(null);
  const plotSizeStyle = { height: plotHeight, minHeight: plotHeight };
  const size = useElementSize(chartRootRef, { debounce: 50 });
  const [settings, setSettings] = useState(DEFAULT_METRIC_VIEW_SETTINGS);
  const [selection, setSelection] = useState<FrameSelection | null>(null);
  const latestFrame = frames.at(-1);
  // A re-stream briefly empties the frames; the remembered output type keeps
  // the controls and chart shape from flickering through the scalar defaults.
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

  if (!latestFrame && label === undefined) {
    return <div className={emptyStyle}>Waiting for metric data</div>;
  }

  return (
    <div className={rootStyle}>
      <div className={headerStyle}>
        <span className={titleStyle}>{latestFrame?.label ?? label}</span>
        {onDisplaySizeChange ? (
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
        ) : null}
      </div>
      {view.displayMode === "number" ? (
        <div className={aggregateNumberStyle} style={plotSizeStyle}>
          {view.aggregateNumber === null
            ? "n/a"
            : formatNumber(view.aggregateNumber)}
        </div>
      ) : (
        <div className={chartFrameStyle}>
          <div
            ref={chartRootRef}
            className={chartStyle}
            style={plotSizeStyle}
          />
          {view.hasPlotData || lastOutputType !== null ? null : (
            <div className={chartWaitingStyle}>Waiting for metric data</div>
          )}
        </div>
      )}
      {view.showsBandLegend ? <BandLegend /> : null}
      <TimelineControls
        outputType={outputType}
        value={settings}
        onChange={setSettings}
      />
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
