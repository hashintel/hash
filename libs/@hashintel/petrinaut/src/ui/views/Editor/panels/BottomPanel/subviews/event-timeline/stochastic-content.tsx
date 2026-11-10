import { use, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { placeCountMetricId } from "@hashintel/petrinaut-core";

import { EventPlaybackContext } from "../../../../../../../react/event-playback/context";
import { useElementOnScreen } from "../../../../../../../react/hooks/use-element-on-screen";
import { SimulationContext } from "../../../../../../../react/simulation/context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { TimelineLegend } from "../simulation-timeline/legend";
import { buildPerPlaceSeriesConfig } from "../simulation-timeline/series-config/per-place";
import { chartAreaStyle, containerStyle } from "../simulation-timeline/styles";
import { EventTimelineChart } from "./chart";
import { MIN_VIEW_SPAN } from "./interactions";
import { stackTimelineData, type FiringMark } from "./series";
import { placeMeanTimeline } from "./stochastic-series";

import type { TimeRange } from "./use-event-timeline-data";
import type { MonteCarloUserDefinedMetricFrame } from "@hashintel/petrinaut-core";

const chartHostStyle = css({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
});

const fitButtonStyle = css({
  position: "absolute",
  top: "1",
  right: "3",
  zIndex: "[1]",
});

const messageStyle = css({
  fontSize: "[12px]",
  color: "neutral.s85",
});

// Many runs have no one firing to mark, and no reference state to show.
const NO_FIRINGS: readonly FiringMark[] = [];
const NO_REFERENCES: readonly number[] = [];
const NO_TRANSITION_NAMES: ReadonlyMap<string, string> = new Map();
const NO_FRAMES: readonly MonteCarloUserDefinedMetricFrame[] = [];
const subscribeToNothing = () => () => {};
const getNoFrames = () => NO_FRAMES;
const stepNowhere = () => {};

/**
 * The timeline of a Stochastic simulation: the mean token count of every
 * place across runs, over time. Drag the ruler or the playhead to scrub,
 * click to view that time, scroll sideways to pan, pinch or wheel to zoom.
 */
export const StochasticTimeline: React.FC<{ showLegend?: boolean }> = ({
  showLegend = true,
}) => {
  const {
    hiddenTimelineSeriesIds: hiddenSeries,
    setHiddenTimelineSeriesIds: setHiddenSeries,
    timelineChartType: chartType,
  } = use(EditorContext);
  const {
    extensions,
    petriNetDefinition: { places, types },
  } = use(SDCPNContext);
  const { stochasticRun } = use(SimulationContext);
  const { coveredTime, playbackStore, setTime, playbackState, play, pause } =
    use(EventPlaybackContext);

  const [zoomedRange, setZoomedRange] = useState<TimeRange | null>(null);
  const domain = Math.max(coveredTime, MIN_VIEW_SPAN);
  const viewRange = zoomedRange ?? { min: 0, max: domain };
  const [selection, setSelection] = useState<TimeRange | null>(null);

  // Scrubbing pauses playback for the drag and resumes it on release.
  const resumeAfterScrubRef = useRef(false);
  const onScrubStart = () => {
    resumeAfterScrubRef.current = playbackState === "Playing";
    if (resumeAfterScrubRef.current) {
      pause();
    }
  };
  const onScrubEnd = () => {
    if (!resumeAfterScrubRef.current) {
      return;
    }
    resumeAfterScrubRef.current = false;
    if (playbackStore.get().time < coveredTime) {
      void play();
    }
  };

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

  const colorsEnabled = extensions.colors;
  const { series } = buildPerPlaceSeriesConfig({
    places: colorsEnabled
      ? places
      : places.map((place) => ({ ...place, colorId: null })),
    types: colorsEnabled ? types : [],
  });
  const data = stochasticRun
    ? placeMeanTimeline(
        stochasticRun.reader,
        series,
        placeCountMetricId,
        frames,
      )
    : null;
  const chartData =
    data !== null && chartType === "stacked"
      ? stackTimelineData(data, hiddenSeries)
      : data;

  return (
    <div className={containerStyle} ref={containerRef}>
      {data === null || chartData === null ? (
        <span className={messageStyle}>No simulation data available</span>
      ) : (
        <>
          <div className={chartHostStyle}>
            {zoomedRange !== null && (
              <Button
                size="xxs"
                variant="ghost"
                className={fitButtonStyle}
                onClick={() => setZoomedRange(null)}
              >
                Fit to run
              </Button>
            )}
            <EventTimelineChart
              className={chartAreaStyle}
              data={chartData}
              firings={NO_FIRINGS}
              references={NO_REFERENCES}
              transitionNames={NO_TRANSITION_NAMES}
              hiddenSeries={hiddenSeries}
              viewRange={viewRange}
              onViewRangeChange={setZoomedRange}
              domain={domain}
              timeSource={playbackStore}
              onScrub={setTime}
              onScrubStart={onScrubStart}
              onScrubEnd={onScrubEnd}
              onStepEvent={stepNowhere}
              onJump={(edge) => setTime(edge === "start" ? 0 : coveredTime)}
              selection={selection}
              onSelectionChange={setSelection}
              paused={!onScreen}
            />
          </div>
          {showLegend && data.series.length > 1 && (
            <TimelineLegend
              series={data.series}
              hiddenSeries={hiddenSeries}
              onHiddenSeriesChange={setHiddenSeries}
            />
          )}
        </>
      )}
    </div>
  );
};
