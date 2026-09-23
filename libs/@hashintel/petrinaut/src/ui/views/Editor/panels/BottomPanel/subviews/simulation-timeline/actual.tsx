import { use, useEffect, useRef, useState } from "react";

import { ExecutionFrameSourceContext } from "../../../../../../../react/execution-frame/context";
import { useElementOnScreen } from "../../../../../../../react/hooks/use-element-on-screen";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { UPlotChart } from "./chart";
import { TimelineLegend } from "./legend";
import { chartAreaStyle, containerStyle } from "./styles";
import { useStreamingData } from "./use-streaming-data";

import type { SubView } from "../../../../../../components/sub-view/types";

const ActualTimelineContent: React.FC = () => {
  const {
    hiddenTimelineSeriesIds: hiddenSeries,
    setHiddenTimelineSeriesIds: setHiddenSeries,
    setTimelineView,
    timelineChartType: chartType,
    timelineView,
  } = use(EditorContext);
  const source = use(ExecutionFrameSourceContext);

  // The timeline keeps reading frames and repainting while it is mounted, so
  // a panel that has been slid off the viewport holds still instead.
  const containerRef = useRef<HTMLDivElement>(null);
  const onScreen = useElementOnScreen(containerRef);

  const { store, metricError } = useStreamingData(source, {
    paused: !onScreen,
  });

  const [isFollowingLive, setIsFollowingLive] = useState(true);
  const { currentFrameIndex, scrubToFrame, totalFrames } = source;
  const lastFrameIndex = Math.max(0, totalFrames - 1);

  useEffect(() => {
    if (timelineView.kind === "metric") {
      setTimelineView({ kind: "per-place" });
    }
  }, [setTimelineView, timelineView.kind]);

  useEffect(() => {
    if (isFollowingLive && totalFrames > 0) {
      scrubToFrame(lastFrameIndex);
    }
  }, [isFollowingLive, lastFrameIndex, scrubToFrame, totalFrames]);

  const handleScrub = (frameIndex: number) => {
    scrubToFrame(frameIndex);
    setIsFollowingLive(frameIndex >= lastFrameIndex);
  };

  return (
    <div className={containerStyle} ref={containerRef}>
      {metricError ? (
        <span style={{ fontSize: 12, color: "#b91c1c" }}>{metricError}</span>
      ) : store.length === 0 || totalFrames === 0 ? (
        <span style={{ fontSize: 12, color: "#999" }}>
          No actual execution data available
        </span>
      ) : (
        <>
          <UPlotChart
            className={chartAreaStyle}
            store={store}
            chartType={chartType}
            hiddenSeries={hiddenSeries}
            totalFrames={totalFrames}
            currentFrameIndex={currentFrameIndex}
            onScrub={handleScrub}
            paused={!onScreen}
          />
          {store.series.length > 1 && (
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

export const actualTimelineSubView: SubView = {
  id: "actual-timeline",
  title: "Timeline",
  tooltip:
    "View the actual execution timeline with compartment time-series. Click/drag to scrub through frames.",
  component: ActualTimelineContent,
  noPadding: true,
};
