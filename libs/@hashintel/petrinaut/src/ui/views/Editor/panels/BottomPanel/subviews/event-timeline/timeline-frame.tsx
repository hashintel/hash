import { use, useRef } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { EventPlaybackContext } from "../../../../../../../react/event-playback/context";
import { SimulationContext } from "../../../../../../../react/simulation/context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { TimelineLegend } from "../simulation-timeline/legend";
import { chartAreaStyle, containerStyle } from "../simulation-timeline/styles";
import { EventTimelineChart } from "./chart";
import { resumesAfterScrub } from "./interactions";
import {
  stackTimelineData,
  type EventTimelineData,
  type FiringMark,
} from "./series";

import type { TimelineViewRange } from "./use-view-range";

// The chart fills the area under the Fit button, which floats over it.
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
  "&[data-tone='error']": { color: "red.s100" },
});

const NO_FIRINGS: readonly FiringMark[] = [];
const NO_REFERENCES: readonly number[] = [];
const NO_TRANSITION_NAMES: ReadonlyMap<string, string> = new Map();

/**
 * What the timeline of a run and of a Stochastic simulation share: the chart
 * with its Fit button and its legend, a scrub that holds playback while it
 * lasts, and the message shown while there is nothing to draw.
 */
export const TimelineFrame: React.FC<{
  view: TimelineViewRange;
  /** The series to draw, or null while there are none. */
  data: EventTimelineData | null;
  /** Draws the series added up. Lanes are marks, and never stack. */
  stacked: boolean;
  /** Shown in place of the chart. */
  error?: string | null;
  firings?: readonly FiringMark[];
  references?: readonly number[];
  transitionNames?: ReadonlyMap<string, string>;
  /** What an arrow key does while the chart has focus. */
  onStep: (direction: -1 | 1) => void;
  showLegend: boolean;
  /** Set on the frame's element, for the caller to watch. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** False while the panel is slid off the viewport: the chart holds still. */
  onScreen: boolean;
}> = ({
  view,
  data,
  stacked,
  error = null,
  firings = NO_FIRINGS,
  references = NO_REFERENCES,
  transitionNames = NO_TRANSITION_NAMES,
  onStep,
  showLegend,
  containerRef,
  onScreen,
}) => {
  const {
    hiddenTimelineSeriesIds: hiddenSeries,
    setHiddenTimelineSeriesIds: setHiddenSeries,
  } = use(EditorContext);
  const { clock } = use(SimulationContext);
  const {
    coveredTime,
    playbackStore,
    setTime,
    playbackState,
    play,
    pause,
    isComputeAvailable,
  } = use(EventPlaybackContext);

  // Scrubbing pauses playback for the drag and resumes it on release, unless
  // the drag ended at the end of a finished run, where play would start
  // over.
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
    if (
      resumesAfterScrub({
        time: playbackStore.get().time,
        coveredTime,
        runIsOver: !isComputeAvailable,
      })
    ) {
      void play();
    }
  };

  // The series list is derived apart from the columns: it holds still while
  // the run streams, and the chart is rebuilt when it changes.
  const chartData =
    data !== null && stacked && data.kind !== "lanes"
      ? stackTimelineData(data, hiddenSeries)
      : data;

  return (
    <div className={containerStyle} ref={containerRef}>
      {error !== null ? (
        <span className={messageStyle} data-tone="error">
          {error}
        </span>
      ) : data === null || chartData === null ? (
        <span className={messageStyle}>No simulation data available</span>
      ) : (
        <>
          <div className={chartHostStyle}>
            {view.zoomed && (
              <Button
                size="xxs"
                variant="ghost"
                className={fitButtonStyle}
                onClick={view.fit}
              >
                Fit to run
              </Button>
            )}
            <EventTimelineChart
              clock={clock}
              className={chartAreaStyle}
              data={chartData}
              firings={firings}
              references={references}
              transitionNames={transitionNames}
              hiddenSeries={hiddenSeries}
              viewRange={view.range}
              onViewRangeChange={view.setRange}
              domain={view.domain}
              timeSource={playbackStore}
              onScrub={setTime}
              onScrubStart={onScrubStart}
              onScrubEnd={onScrubEnd}
              onStep={onStep}
              onJump={(edge) => setTime(edge === "start" ? 0 : coveredTime)}
              paused={!onScreen}
            />
          </div>
          {showLegend && data.kind !== "lanes" && data.series.length > 1 && (
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
