import { use, useEffect, useRef, useState } from "react";

import { ExecutionFrameSourceContext } from "../../../../../../../react/execution-frame/context";
import {
  useEditorActions,
  useEditorFields,
} from "../../../../../../../react/state/editor-context";
import { UPlotChart } from "./actual-timeline/chart";
import { useStreamingData } from "./actual-timeline/use-streaming-data";
import { TimelineLegend } from "./shared/legend";
import { chartAreaStyle, containerStyle } from "./shared/styles";
import { useElementOnScreen } from "./shared/use-element-on-screen";
import { PER_PLACE_VIEW } from "./shared/use-run-timeline-view";

export const ActualTimeline: React.FC<{
  showLegend?: boolean;
}> = ({ showLegend = true }) => {
  "use no memo";
  // `useStreamingData` appends frames to the same store object, so a memoized
  // render keeps what it drew before them: a run that has finished when the
  // timeline mounts stays on "no data".

  const {
    hiddenTimelineSeriesIds: hiddenSeries,
    timelineChartType: chartType,
    timelineView,
  } = useEditorFields(
    "hiddenTimelineSeriesIds",
    "timelineChartType",
    "timelineView",
  );
  const { setHiddenTimelineSeriesIds: setHiddenSeries, setTimelineView } =
    useEditorActions();
  const source = use(ExecutionFrameSourceContext);

  // The timeline keeps reading frames and repainting while it is mounted, so
  // a panel that has been slid off the viewport holds still instead.
  const containerRef = useRef<HTMLDivElement>(null);
  const onScreen = useElementOnScreen(containerRef);

  // An execution reported by the host carries token counts only: no metric
  // is evaluated on it, and no solver recorded an error. Such a pick draws
  // tokens per place, and the effect below makes that the pick.
  const pickHasNoData =
    timelineView.kind === "metric" || timelineView.kind === "solver-error";
  const store = useStreamingData(
    source,
    pickHasNoData ? PER_PLACE_VIEW : timelineView,
    !onScreen,
  );

  const [isFollowingLive, setIsFollowingLive] = useState(true);
  const { currentFrameIndex, scrubToFrame, totalFrames } = source;
  const lastFrameIndex = Math.max(0, totalFrames - 1);

  useEffect(() => {
    if (pickHasNoData) {
      setTimelineView(PER_PLACE_VIEW);
    }
  }, [pickHasNoData, setTimelineView]);

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
      {store.length === 0 || totalFrames === 0 ? (
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
