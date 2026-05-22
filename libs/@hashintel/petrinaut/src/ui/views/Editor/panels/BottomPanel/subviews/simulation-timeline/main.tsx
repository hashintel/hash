import { use, useState } from "react";

import { PlaybackContext } from "../../../../../../../react/playback/context";
import { SimulationContext } from "../../../../../../../react/simulation/context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { UPlotChart } from "./chart";
import { TimelineHeaderActions } from "./header";
import { TimelineLegend } from "./legend";
import { chartAreaStyle, containerStyle } from "./styles";
import { useStreamingData } from "./use-streaming-data";

import type { SubView } from "../../../../../../components/sub-view/types";

const SimulationTimelineContent: React.FC = () => {
  const { timelineChartType: chartType } = use(EditorContext);
  const { totalFrames } = use(SimulationContext);
  const { currentFrameIndex } = use(PlaybackContext);
  const { store, metricError } = useStreamingData();

  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  const toggleSeriesVisibility = (seriesId: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(seriesId)) {
        next.delete(seriesId);
      } else {
        next.add(seriesId);
      }
      return next;
    });
  };

  if (metricError) {
    return (
      <div className={containerStyle}>
        <span style={{ fontSize: 12, color: "#b91c1c" }}>{metricError}</span>
      </div>
    );
  }

  if (store.length === 0 || totalFrames === 0) {
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
        totalFrames={totalFrames}
        currentFrameIndex={currentFrameIndex}
      />
      {store.series.length > 1 && (
        <TimelineLegend
          series={store.series}
          hiddenSeries={hiddenSeries}
          onToggleVisibility={toggleSeriesVisibility}
        />
      )}
    </div>
  );
};

export const simulationTimelineSubView: SubView = {
  id: "simulation-timeline",
  title: "Timeline",
  tooltip:
    "View the simulation timeline with compartment time-series. Click/drag to scrub through frames.",
  component: SimulationTimelineContent,
  renderHeaderAction: () => <TimelineHeaderActions />,
  noPadding: true,
};
