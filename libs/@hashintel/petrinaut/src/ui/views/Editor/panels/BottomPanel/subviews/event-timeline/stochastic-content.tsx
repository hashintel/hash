import { use, useSyncExternalStore } from "react";

import { placeCountMetricId } from "@hashintel/petrinaut-core";

import { EventPlaybackContext } from "../../../../../../../react/event-playback/context";
import { SimulationContext } from "../../../../../../../react/simulation/context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { buildPerPlaceSeriesConfig } from "../simulation-timeline/series-config/per-place";
import { placeMeanTimeline } from "./stochastic-series";
import { TimelineFrame } from "./timeline-frame";
import { useTimelineViewRange } from "./use-view-range";

import type { MonteCarloUserDefinedMetricFrame } from "@hashintel/petrinaut-core";

const NO_FRAMES: readonly MonteCarloUserDefinedMetricFrame[] = [];
const subscribeToNothing = () => () => {};
const getNoFrames = () => NO_FRAMES;

/**
 * The timeline of a Stochastic simulation: the mean token count of every
 * place across runs, over time.
 */
export const StochasticTimeline: React.FC<{ showLegend?: boolean }> = ({
  showLegend = true,
}) => {
  const { timelineChartType: chartType } = use(EditorContext);
  const {
    extensions,
    petriNetDefinition: { places, types },
  } = use(SDCPNContext);
  const { stochasticRun } = use(SimulationContext);
  const { playbackStore, setTime } = use(EventPlaybackContext);
  const view = useTimelineViewRange();

  // The experiment publishes a new array whenever samples arrive.
  const metrics = stochasticRun?.experiment.metrics;
  const frames = useSyncExternalStore(
    metrics
      ? (listener: () => void) => metrics.subscribe(listener)
      : subscribeToNothing,
    metrics ? () => metrics.get().frames : getNoFrames,
  );

  const colorsEnabled = extensions.colors;
  const { series } = buildPerPlaceSeriesConfig({
    places: colorsEnabled
      ? places
      : places.map((place) => ({ ...place, colorId: null })),
    types: colorsEnabled ? types : [],
  });

  return (
    <TimelineFrame
      view={view}
      data={
        stochasticRun
          ? placeMeanTimeline(
              stochasticRun.reader,
              series,
              placeCountMetricId,
              frames,
            )
          : null
      }
      stacked={chartType === "stacked"}
      // Many runs have no one firing to step to, so an arrow key moves by a
      // sample.
      onStep={(direction) => {
        if (stochasticRun) {
          setTime(
            playbackStore.get().time + direction * stochasticRun.samplePeriod,
          );
        }
      }}
      showLegend={showLegend}
    />
  );
};
