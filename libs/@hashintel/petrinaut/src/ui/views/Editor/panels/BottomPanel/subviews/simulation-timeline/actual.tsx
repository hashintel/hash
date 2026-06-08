import { use, useEffect, useState } from "react";

import { EditorContext } from "../../../../../../../react/state/editor-context";
import { UPlotChart } from "./chart";
import { TimelineLegend } from "./legend";
import { chartAreaStyle, containerStyle } from "./styles";
import { useActualTimelineSource } from "./use-actual-timeline-source";
import { useStreamingData } from "./use-streaming-data";

import type { SubView } from "../../../../../../components/sub-view/types";

const ActualTimelineContent: React.FC = () => {
  const {
    setTimelineView,
    timelineChartType: chartType,
    timelineView,
  } = use(EditorContext);
  const { currentFrameIndex, isAvailable, setCurrentFrameIndex, source } =
    useActualTimelineSource();
  const { store, metricError } = useStreamingData(source);

  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [isFollowingLive, setIsFollowingLive] = useState(true);
  const totalFrames = source.totalFrames;
  const lastFrameIndex = Math.max(0, totalFrames - 1);
  const safeCurrentFrameIndex = Math.min(currentFrameIndex, lastFrameIndex);

  useEffect(() => {
    if (timelineView.kind === "metric") {
      setTimelineView({ kind: "per-place" });
    }
  }, [setTimelineView, timelineView.kind]);

  useEffect(() => {
    if (isFollowingLive && totalFrames > 0) {
      setCurrentFrameIndex(lastFrameIndex);
    }
  }, [isFollowingLive, lastFrameIndex, setCurrentFrameIndex, totalFrames]);

  useEffect(() => {
    if (currentFrameIndex > lastFrameIndex) {
      setCurrentFrameIndex(lastFrameIndex);
    }
  }, [currentFrameIndex, lastFrameIndex, setCurrentFrameIndex]);

  const handleScrub = (frameIndex: number) => {
    setCurrentFrameIndex(frameIndex);
    setIsFollowingLive(frameIndex >= lastFrameIndex);
  };

  if (metricError) {
    return (
      <div className={containerStyle}>
        <span style={{ fontSize: 12, color: "#b91c1c" }}>{metricError}</span>
      </div>
    );
  }

  if (!isAvailable || store.length === 0 || totalFrames === 0) {
    return (
      <div className={containerStyle}>
        <span style={{ fontSize: 12, color: "#999" }}>
          No actual execution data available
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
        totalFrames={totalFrames}
        currentFrameIndex={safeCurrentFrameIndex}
        onScrub={handleScrub}
      />
      {store.series.length > 1 && (
        <TimelineLegend
          series={store.series}
          hiddenSeries={hiddenSeries}
          onHiddenSeriesChange={setHiddenSeries}
        />
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
