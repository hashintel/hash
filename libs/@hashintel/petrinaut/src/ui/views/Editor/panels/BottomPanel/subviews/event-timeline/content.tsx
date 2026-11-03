import { use, useRef, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { EventPlaybackContext } from "../../../../../../../react/event-playback/context";
import { useElementOnScreen } from "../../../../../../../react/hooks/use-element-on-screen";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { TimelineLegend } from "../simulation-timeline/legend";
import { chartAreaStyle, containerStyle } from "../simulation-timeline/styles";
import { EventTimelineChart } from "./chart";
import { MIN_VIEW_SPAN } from "./interactions";
import {
  useEventTimelineData,
  type TimeRange,
} from "./use-event-timeline-data";

/** Samples a continuous series is read at across the visible range. */
const SAMPLE_COUNT = 400;

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
});

/**
 * The timeline of an event-driven run: token counts step at the events,
 * metrics follow the interpolated state, and every firing is marked on the
 * ruler. Drag the ruler or the playhead to scrub, drag the plot to select a
 * range, click to view that time, scroll sideways to pan, pinch or wheel to
 * zoom.
 */
export const EventTimeline: React.FC<{ showLegend?: boolean }> = ({
  showLegend = true,
}) => {
  const {
    hiddenTimelineSeriesIds: hiddenSeries,
    setHiddenTimelineSeriesIds: setHiddenSeries,
  } = use(EditorContext);
  const {
    petriNetDefinition: { transitions },
  } = use(SDCPNContext);
  const {
    eventCount,
    coveredTime,
    playbackStore,
    setTime,
    playbackState,
    play,
    pause,
    stepToEvent,
  } = use(EventPlaybackContext);

  // Null follows the whole run as it grows; a range is where the user
  // zoomed or panned to, and stays put until they fit the run again.
  const [zoomedRange, setZoomedRange] = useState<TimeRange | null>(null);
  const domain = Math.max(coveredTime, MIN_VIEW_SPAN);
  const viewRange = zoomedRange ?? { min: 0, max: domain };

  // A selected range has no effect yet; it is drawn, and Escape or a click
  // drops it.
  const [selection, setSelection] = useState<TimeRange | null>(null);

  // Scrubbing pauses playback for the drag and resumes it on release, unless
  // the drag ended at the live edge of a finished run, where play would
  // start over.
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

  const { data, firings, references, metricError } = useEventTimelineData({
    viewMin: viewRange.min,
    viewMax: viewRange.max,
    sampleCount: SAMPLE_COUNT,
  });
  const transitionNames = new Map(
    transitions.map((transition) => [transition.id, transition.name]),
  );

  return (
    <div className={containerStyle} ref={containerRef}>
      {metricError ? (
        <span className={messageStyle} style={{ color: "#b91c1c" }}>
          {metricError}
        </span>
      ) : data === null || eventCount === 0 ? (
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
              data={data}
              firings={firings}
              references={references}
              transitionNames={transitionNames}
              hiddenSeries={hiddenSeries}
              viewRange={viewRange}
              onViewRangeChange={setZoomedRange}
              domain={domain}
              timeSource={playbackStore}
              onScrub={setTime}
              onScrubStart={onScrubStart}
              onScrubEnd={onScrubEnd}
              onStepEvent={stepToEvent}
              onJump={(edge) => setTime(edge === "start" ? 0 : coveredTime)}
              selection={selection}
              onSelectionChange={setSelection}
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
