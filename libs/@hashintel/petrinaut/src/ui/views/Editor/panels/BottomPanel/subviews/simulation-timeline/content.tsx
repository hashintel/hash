import { use } from "react";

import { ExecutionFrameSourceContext } from "../../../../../../../react/execution-frame/context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { UPlotChart } from "./chart";
import { TimelineLegend } from "./legend";
import { chartAreaStyle, containerStyle } from "./styles";
import { useStreamingData } from "./use-streaming-data";

export const SimulationTimeline: React.FC<{
  showLegend?: boolean;
}> = ({ showLegend = true }) => {
  const {
    hiddenTimelineSeriesIds: hiddenSeries,
    setHiddenTimelineSeriesIds: setHiddenSeries,
    timelineChartType: chartType,
  } = use(EditorContext);
  const source = use(ExecutionFrameSourceContext);
  const { store, metricError } = useStreamingData(source);

  if (metricError) {
    return (
      <div className={containerStyle}>
        <span style={{ fontSize: 12, color: "#b91c1c" }}>{metricError}</span>
      </div>
    );
  }

  if (store.length === 0 || source.totalFrames === 0) {
    return (
      <div className={containerStyle}>
        <span style={{ fontSize: 12, color: "#999" }}>
          No simulation data available
        </span>
      </div>
    );
  }

  return (
    <div className={containerStyle}>
      <UPlotChart
        className={chartAreaStyle}
        store={store}
        chartType={chartType}
        hiddenSeries={hiddenSeries}
        totalFrames={source.totalFrames}
        currentFrameIndex={source.currentFrameIndex}
        onScrub={source.scrubToFrame}
      />
      {showLegend && store.series.length > 1 && (
        <TimelineLegend
          series={store.series}
          hiddenSeries={hiddenSeries}
          onHiddenSeriesChange={setHiddenSeries}
        />
      )}
    </div>
  );
};
