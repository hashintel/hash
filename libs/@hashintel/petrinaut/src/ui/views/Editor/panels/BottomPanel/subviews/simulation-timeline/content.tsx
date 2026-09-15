import { use, useRef } from "react";

import { ExecutionFrameSourceContext } from "../../../../../../../react/execution-frame/context";
import { useElementOnScreen } from "../../../../../../../react/hooks/use-element-on-screen";
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

  // A closed bottom panel is moved off the viewport rather than unmounted, so
  // without this the timeline would go on reading frames and repainting a
  // chart nobody can see for as long as the run lasts.
  const containerRef = useRef<HTMLDivElement>(null);
  const onScreen = useElementOnScreen(containerRef);

  const { store, metricError } = useStreamingData(source, {
    paused: !onScreen,
  });

  return (
    <div className={containerStyle} ref={containerRef}>
      {metricError ? (
        <span style={{ fontSize: 12, color: "#b91c1c" }}>{metricError}</span>
      ) : store.length === 0 || source.totalFrames === 0 ? (
        <span style={{ fontSize: 12, color: "#999" }}>
          No simulation data available
        </span>
      ) : (
        <>
          <UPlotChart
            className={chartAreaStyle}
            store={store}
            chartType={chartType}
            hiddenSeries={hiddenSeries}
            totalFrames={source.totalFrames}
            currentFrameIndex={source.currentFrameIndex}
            onScrub={source.scrubToFrame}
            paused={!onScreen}
          />
          {showLegend && store.series.length > 1 && (
            <TimelineLegend
              series={store.series}
              hiddenSeries={hiddenSeries}
              onHiddenSeriesChange={setHiddenSeries}
            />
          )}
        </>
      )}
    </div>
  );
};
