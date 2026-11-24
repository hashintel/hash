/**
 * @layerRoot ui.views.editor.simulate.experiments.results.metric-timeline
 * @role Charts one metric of an experiment over time, as a line, percentile bands, a density heatmap or one number, while its frames stream in
 *
 * `ExperimentMetricTimeline` is the entry. The card that shows a chart holds
 * its view settings (`view-state.ts`), offers `MetricViewMenu` to change
 * them and words them as its subtitle (`describe-metric-view.ts`); the other
 * files of this folder are the chart's own parts.
 */
import { useRef, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";
import "uplot/dist/uPlot.min.css";

import { useElementSize } from "../../../../../../../shared/use-element-size";
import { formatFixed } from "../format-value";
import { FramePopover } from "./frame-popover";
import { MetricPlot } from "./metric-plot";
import { distributionBandLegend } from "./shared/distribution-bands";
import { deriveMetricViewState, selectedFrameFrom } from "./view-state";

import type { MetricFrame } from "./shared/metric-frames";
import type { FrameSelection, MetricViewSettings } from "./view-state";

// The component is exactly the plot's height: the waiting note and the
// legend sit on the frame as overlays, so no view setting adds a row.
const frameStyle = css({
  position: "relative",
  width: "full",
  minWidth: "[0]",
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

// A component, so that no call takes a field of the view: the compiler would
// rebuild the view with every element that follows such a call.
const AggregateNumber = ({ value }: { value: number | null }) => (
  <div className={aggregateNumberStyle}>
    {value === null ? "n/a" : formatFixed(value)}
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
   * The time window the x axis is pinned to (typically `[0, maxTime]`): the
   * chart draws its axes before the first frame and never rescales in time.
   */
  timeDomain: readonly [number, number];
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
  // A re-stream briefly empties the frames; the remembered output type keeps
  // the chart shape from flickering through the scalar defaults.
  const [lastOutputType, setLastOutputType] = useState<
    MetricFrame["outputType"] | null
  >(null);
  const latestFrame = frames.at(-1);
  if (latestFrame && latestFrame.outputType !== lastOutputType) {
    setLastOutputType(latestFrame.outputType);
  }
  const outputType =
    latestFrame?.outputType ?? lastOutputType ?? expectedOutputType ?? "scalar";
  const view = deriveMetricViewState({ frames, outputType, settings });
  const selectedFrame = selection ? selectedFrameFrom(frames, selection) : null;

  return (
    <div
      className={frameStyle}
      style={{ height: plotHeight, minHeight: plotHeight }}
    >
      {view.displayMode === "number" ? (
        <AggregateNumber value={view.aggregateNumber} />
      ) : (
        <>
          <MetricPlot
            chartRootRef={chartRootRef}
            size={size}
            displayMode={view.displayMode}
            outputType={outputType}
            aggregateRuns={settings.aggregateRuns}
            runAggregation={settings.runAggregation}
            distributionView={settings.distributionView}
            timeTrace={settings.timeTrace}
            timeDomainStart={timeDomain[0]}
            timeDomainEnd={timeDomain[1]}
            frames={frames}
            plotData={view.plotData}
            contentEpoch={contentEpoch}
            onFrameSelect={(pick) =>
              setSelection({
                index: pick.index,
                frameNumber: pick.frame.frameNumber,
                pointer: pick.pointer,
              })
            }
          />
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
