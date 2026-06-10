import { use, useState } from "react";

import { ExecutionFrameSourceContext } from "../../../../../../../react/execution-frame/context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { UPlotChart } from "./chart";
import { TimelineHeaderActions } from "./header";
import { TimelineLegend } from "./legend";
import { chartAreaStyle, containerStyle } from "./styles";
import { useStreamingData } from "./use-streaming-data";

import type { SubView } from "../../../../../../components/sub-view/types";

const SimulationTimelineContent: React.FC = () => {
  const { timelineChartType: chartType } = use(EditorContext);
  const source = use(ExecutionFrameSourceContext);
  const { store, metricError } = useStreamingData(source);

  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

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

export const simulationTimelineSubView: SubView = {
  id: "simulation-timeline",
  title: "Timeline",
  tooltip:
    "View the simulation timeline with compartment time-series. Click/drag to scrub through frames.",
  component: SimulationTimelineContent,
  renderHeaderAction: () => <TimelineHeaderActions />,
  noPadding: true,
};
