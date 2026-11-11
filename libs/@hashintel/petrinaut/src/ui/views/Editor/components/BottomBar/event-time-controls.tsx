import { use } from "react";

import { Icon } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { EventPlaybackContext } from "../../../../../react/event-playback/context";
import { useEventPlaybackFrame } from "../../../../../react/event-playback/use-event-playback-frame";
import { SimulationContext } from "../../../../../react/simulation/context";
import { usePetrinautPresentation } from "../../../shared/presentation-context";
import { formatEventPlaybackTimes } from "./event-playback-time";
import { ToolbarButton } from "./toolbar-button";
import { ToolbarDivider } from "./toolbar-divider";

/** What the controls call a position and the things between positions, per clock. */
const WORDING = {
  time: {
    previous: "Previous event",
    previousLabel: "Go to the previous event",
    next: "Next event",
    nextLabel: "Go to the next event",
    slider: "Viewed simulation time",
  },
  steps: {
    previous: "Previous step",
    previousLabel: "Go to the previous step",
    next: "Next step",
    nextLabel: "Go to the next step",
    slider: "Viewed step",
  },
} as const;

// The readout is wide enough for three decimals of seconds.
const timeReadoutStyle = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
    width: "[72px]",
    lineHeight: "[1.15]",
    gap: "[1px]",
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "[-0.2px]",
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  variants: {
    compact: {
      true: { width: "[64px]" },
    },
  },
});

const elapsedTimeStyle = css({
  fontSize: "[11px]",
  fontWeight: "medium",
  color: "neutral.s110",
});

const timeUnitStyle = css({
  fontSize: "[9px]",
  fontWeight: "normal",
  color: "neutral.s95",
});

const totalTimeStyle = css({
  fontSize: "[9px]",
  color: "neutral.s95",
});

const sliderStyle = cva({
  base: {
    width: "[clamp(140px, 24vw, 420px)]",
    flex: "[1 1 auto]",
    minWidth: "[96px]",
    maxWidth: "[100%]",
    height: "[4px]",
    appearance: "none",
    background: "neutral.s30",
    borderRadius: "[2px]",
    outline: "none",
    cursor: "pointer",
    "&:disabled": {
      opacity: "[0.5]",
      cursor: "not-allowed",
    },
    "&::-webkit-slider-thumb": {
      appearance: "none",
      width: "[12px]",
      height: "[12px]",
      borderRadius: "[50%]",
      background: "blue.s90",
      cursor: "pointer",
    },
    "&::-moz-range-thumb": {
      width: "[12px]",
      height: "[12px]",
      borderRadius: "[50%]",
      background: "blue.s90",
      cursor: "pointer",
      border: "none",
    },
  },
  variants: {
    compact: {
      true: {
        width: "[clamp(96px, 34vw, 360px)]",
        minWidth: "[72px]",
      },
    },
  },
});

/**
 * The part of the event controls that shows the viewed position: the
 * readout, the scrubber and the event steppers. A timed run reads in
 * seconds; an untimed one in steps, and its scrubber moves a step at a time.
 * It re-renders on every animation frame while playing, which is why it is
 * its own component: the rest of the bar stays put.
 */
export const EventTimeControls: React.FC<{
  disabled: boolean;
  /** False where there are no events to step between, as across many runs. */
  showEventSteppers?: boolean;
}> = ({ disabled, showEventSteppers = true }) => {
  const presentation = usePetrinautPresentation();
  const { clock } = use(SimulationContext);
  const { coveredTime, setTime, stepToEvent } = use(EventPlaybackContext);
  const { time, hasPreviousEvent, hasNextEvent } = useEventPlaybackFrame();
  const times = formatEventPlaybackTimes({ clock, time, coveredTime });
  const wording = WORDING[clock];

  return (
    <>
      {showEventSteppers ? (
        <>
          <ToolbarButton
            tooltip={wording.previous}
            onClick={() => stepToEvent(-1)}
            disabled={disabled || !hasPreviousEvent}
            ariaLabel={wording.previousLabel}
          >
            <Icon name="chevronLeft" size="sm" />
          </ToolbarButton>
          <ToolbarButton
            tooltip={wording.next}
            onClick={() => stepToEvent(1)}
            disabled={disabled || !hasNextEvent}
            ariaLabel={wording.nextLabel}
          >
            <Icon name="chevronRight" size="sm" />
          </ToolbarButton>
        </>
      ) : null}

      {clock === "steps" ? (
        <div
          role="timer"
          aria-label={`Step ${times.elapsed} of ${times.total} computed`}
          className={timeReadoutStyle({
            compact: presentation.compactControls,
          })}
        >
          <span className={elapsedTimeStyle}>
            <span className={timeUnitStyle}>Step </span>
            {times.elapsed}
          </span>
          <span className={totalTimeStyle}>of {times.total}</span>
        </div>
      ) : (
        <div
          role="timer"
          aria-label={`Elapsed ${times.elapsed} seconds of ${times.total} seconds computed`}
          className={timeReadoutStyle({
            compact: presentation.compactControls,
          })}
        >
          <span className={elapsedTimeStyle}>
            {times.elapsed}
            <span className={timeUnitStyle}> s</span>
          </span>
          <span className={totalTimeStyle}>of {times.total} s</span>
        </div>
      )}

      <input
        type="range"
        min="0"
        max={coveredTime}
        step={clock === "steps" ? 1 : "any"}
        value={time}
        disabled={disabled || coveredTime === 0}
        onChange={(event) => setTime(Number(event.target.value))}
        aria-label={wording.slider}
        className={sliderStyle({ compact: presentation.compactControls })}
      />

      <ToolbarDivider />
    </>
  );
};
