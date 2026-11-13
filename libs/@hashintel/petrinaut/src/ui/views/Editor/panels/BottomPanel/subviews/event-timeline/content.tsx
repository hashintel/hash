import { use, useRef } from "react";

import { EventPlaybackContext } from "../../../../../../../react/event-playback/context";
import { useElementOnScreen } from "../../../../../../../react/hooks/use-element-on-screen";
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
 * interpolated state, and every firing is marked on the ruler. So are the
 * reference frames of a continuous run. A discrete run has nothing to
 * interpolate, so the frames a simulator kept between its firings mark
 * nothing and are left out.
 */
const RunTimeline: React.FC<{ showLegend?: boolean }> = ({
  showLegend = true,
}) => {
  const { timelineChartType: chartType } = use(EditorContext);
  const {
    petriNetDefinition: { transitions },
  } = use(SDCPNContext);
  const { continuity } = use(SimulationContext);
  const { eventCount, stepToEvent } = use(EventPlaybackContext);
  const timelineView = useRunTimelineView();
  const view = useTimelineViewRange();
  const containerRef = useRef<HTMLDivElement>(null);
  const onScreen = useElementOnScreen(containerRef);

  const { data, firings, references, metricError } = useEventTimelineData({
    viewMin: view.range.min,
    viewMax: view.range.max,
    sampleCount: SAMPLE_COUNT,
    paused: !onScreen,
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
      references={continuity === "discrete" ? undefined : references}
      transitionNames={transitionNames}
      onStep={stepToEvent}
      showLegend={showLegend}
      containerRef={containerRef}
      onScreen={onScreen}
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
