import { use, useRef, useSyncExternalStore } from "react";

import { placeCountMetricId } from "@hashintel/petrinaut-core";

import { EventPlaybackContext } from "../../../../../../../react/event-playback/context";
import { usePetrinautDefinitionSelector } from "../../../../../../../react/hooks/use-document";
import { useElementOnScreen } from "../../../../../../../react/hooks/use-element-on-screen";
import { SimulationContext } from "../../../../../../../react/simulation/context";
import { useEditorState } from "../../../../../../../react/state/editor-context";
import { useSDCPNState } from "../../../../../../../react/state/sdcpn-context";
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
  const chartType = useEditorState((editor) => editor.timelineChartType);
  const colorsEnabled = useSDCPNState((document) => document.extensions.colors);
  const places = usePetrinautDefinitionSelector((net) => net.places);
  const types = usePetrinautDefinitionSelector((net) => net.types);
  const { stochasticRun } = use(SimulationContext);
  const { playbackStore, setTime } = use(EventPlaybackContext);
  const view = useTimelineViewRange();
  const containerRef = useRef<HTMLDivElement>(null);
  const onScreen = useElementOnScreen(containerRef);

  // The experiment publishes a new array whenever samples arrive.
  const metrics = stochasticRun?.experiment.metrics;
  const frames = useSyncExternalStore(
    metrics
      ? (listener: () => void) => metrics.subscribe(listener)
      : subscribeToNothing,
    metrics ? () => metrics.get().frames : getNoFrames,
  );

  const { series } = buildPerPlaceSeriesConfig({
    places,
    // Without colours a place's type is not found, so it takes a default colour.
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
      containerRef={containerRef}
      onScreen={onScreen}
    />
  );
};
