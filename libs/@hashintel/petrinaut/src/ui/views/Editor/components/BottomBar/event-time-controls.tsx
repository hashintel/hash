import { use } from "react";

import { Icon } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { EventPlaybackContext } from "../../../../../react/event-playback/context";
import { useEventPlaybackFrame } from "../../../../../react/event-playback/use-event-playback-frame";
import { usePetrinautPresentation } from "../../../shared/presentation-context";
import { formatEventPlaybackTimes } from "./event-playback-time";
import { ToolbarButton } from "./toolbar-button";
import { ToolbarDivider } from "./toolbar-divider";

// The same readout and scrubber as the frame controls, with a wider readout:
// three decimals of seconds take more room than a step's worth.
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
 * The part of the event controls that shows the viewed time: the readout,
 * the scrubber and the event steppers. It re-renders on every animation
 * frame while playing, which is why it is its own component: the rest of
 * the bar stays put.
 */
export const EventTimeControls: React.FC<{ disabled: boolean }> = ({
  disabled,
}) => {
  const presentation = usePetrinautPresentation();
  const { coveredTime, setTime, stepToEvent } = use(EventPlaybackContext);
  const { time, hasPreviousEvent, hasNextEvent } = useEventPlaybackFrame();
  const times = formatEventPlaybackTimes({ time, coveredTime });

  return (
    <>
      <ToolbarButton
        tooltip="Previous event"
        onClick={() => stepToEvent(-1)}
        disabled={disabled || !hasPreviousEvent}
        ariaLabel="Go to the previous event"
      >
        <Icon name="chevronLeft" size="sm" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Next event"
        onClick={() => stepToEvent(1)}
        disabled={disabled || !hasNextEvent}
        ariaLabel="Go to the next event"
      >
        <Icon name="chevronRight" size="sm" />
      </ToolbarButton>

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

      <input
        type="range"
        min="0"
        max={coveredTime}
        step="any"
        value={time}
        disabled={disabled || coveredTime === 0}
        onChange={(event) => setTime(Number(event.target.value))}
        aria-label="Viewed simulation time"
        className={sliderStyle({ compact: presentation.compactControls })}
      />

      <ToolbarDivider />
    </>
  );
};
