import { use } from "react";

import { EventPlaybackContext } from "../../../../../../../react/event-playback/context";
import { SimulationContext } from "../../../../../../../react/simulation/context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { useRunTimelineView } from "../simulation-timeline/use-run-timeline-view";
import { StochasticTimeline } from "./stochastic-content";
import { TimelineFrame } from "./timeline-frame";
import { useEventTimelineData } from "./use-event-timeline-data";
import { useTimelineViewRange } from "./use-view-range";

/** Samples a continuous series is read at across the visible range. */
const SAMPLE_COUNT = 400;

/**
 * The timeline of a run: token counts step at the events, metrics follow the
 * interpolated state, and every firing is marked on the ruler.
 */
const RunTimeline: React.FC<{ showLegend?: boolean }> = ({
  showLegend = true,
}) => {
  const { timelineChartType: chartType } = use(EditorContext);
  const {
    petriNetDefinition: { transitions },
  } = use(SDCPNContext);
  const { eventCount, stepToEvent } = use(EventPlaybackContext);
  const timelineView = useRunTimelineView();
  const view = useTimelineViewRange();

  const { data, firings, references, metricError } = useEventTimelineData({
    viewMin: view.range.min,
    viewMax: view.range.max,
    sampleCount: SAMPLE_COUNT,
  });
  const transitionNames = new Map(
    transitions.map((transition) => [transition.id, transition.name]),
  );

  return (
    <TimelineFrame
      view={view}
      data={eventCount === 0 ? null : data}
      // Stacking adds series up, which means something for counts and for a
      // metric; the solver's error per place is read off each line on its
      // own.
      stacked={chartType === "stacked" && timelineView.kind !== "solver-error"}
      error={metricError}
      firings={firings}
      references={references}
      transitionNames={transitionNames}
      onStep={stepToEvent}
      showLegend={showLegend}
    />
  );
};

/**
 * The Timeline of whatever Play computed: one run's events, or a Stochastic
 * simulation's counts across runs.
 */
export const EventTimeline: React.FC<{ showLegend?: boolean }> = (props) => {
  const { mode } = use(SimulationContext);
  return mode === "stochastic" ? (
    <StochasticTimeline {...props} />
  ) : (
    <RunTimeline {...props} />
  );
};
