import { use } from "react";

import { Icon } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { EventPlaybackContext } from "../../../../../react/event-playback/context";
import { SimulationContext } from "../../../../../react/simulation/context";
import { EditorContext } from "../../../../../react/state/editor-context";
import {
  PlaybackIcon,
  useExperimentalIconPackEnabled,
} from "../../../../experimental-icons";
import { usePetrinautPresentation } from "../../../shared/presentation-context";
import { CollapsibleGroup } from "./collapsible-group";
import { formatEventPlaybackTimes } from "./event-playback-time";
import { PlaybackSettingsMenu } from "./playback-settings-menu";
import { ToolbarButton } from "./toolbar-button";
import { ToolbarDivider } from "./toolbar-divider";

import type { PlaybackSpeed } from "../../../../../react/playback/context";

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

export interface EventSimulationControlsProps {
  disabled?: boolean;
  inSubnet?: boolean;
  allowedPlaybackSpeeds?: readonly PlaybackSpeed[];
}

/**
 * The bottom bar's playback controls over an event-driven run: the frame
 * controls' counterpart, scrubbing a continuous time and stepping between
 * events rather than frames.
 */
export const EventSimulationControls: React.FC<
  EventSimulationControlsProps
> = ({ disabled = false, inSubnet = false, allowedPlaybackSpeeds }) => {
  const presentation = usePetrinautPresentation();
  const experimentalIcons = useExperimentalIconPackEnabled();
  const { state: simulationState, reset } = use(SimulationContext);
  const playback = use(EventPlaybackContext);
  const {
    time,
    coveredTime,
    hasPreviousEvent,
    hasNextEvent,
    playbackState,
    setTime,
    stepToEvent,
    play,
    pause,
  } = playback;
  const { setBottomPanelOpen, setActiveBottomPanelTab } = use(EditorContext);

  const hasSimulation = simulationState !== "NotRun";
  const isSimulationOver =
    simulationState === "Complete" || simulationState === "Error";
  const isPlaying = playbackState === "Playing";
  const isAtEnd = isSimulationOver && time >= coveredTime;
  const isPlayDisabled = disabled || inSubnet || isAtEnd;
  const times = formatEventPlaybackTimes({ time, coveredTime });

  const playTooltip = inSubnet
    ? "Return to the root net to run simulation"
    : disabled
      ? "Fix errors to run simulation"
      : isAtEnd
        ? "Playback finished - Reset to run again"
        : !hasSimulation
          ? "Start Simulation"
          : isPlaying
            ? "Pause Playback"
            : "Play";

  const handlePlayPause = () => {
    if (disabled && !inSubnet) {
      setActiveBottomPanelTab("diagnostics");
      setBottomPanelOpen(true);
      return;
    }
    if (isPlaying) {
      pause();
    } else {
      void play();
    }
  };

  return (
    <>
      {hasSimulation && (
        <CollapsibleGroup animateEntry>
          <ToolbarButton
            tooltip="Stop simulation"
            onClick={reset}
            disabled={disabled}
            ariaLabel="Reset simulation"
          >
            <Icon name="rotateLeft" />
          </ToolbarButton>
          <ToolbarDivider />
        </CollapsibleGroup>
      )}

      <ToolbarButton
        tooltip={playTooltip}
        onClick={handlePlayPause}
        disabled={isPlayDisabled}
        ariaLabel={playTooltip}
      >
        {experimentalIcons ? (
          <PlaybackIcon playing={isPlaying} duration={200} />
        ) : isPlaying ? (
          <Icon name="pauseFilled" />
        ) : (
          <Icon name="playFilled" />
        )}
      </ToolbarButton>

      <CollapsibleGroup>
        {hasSimulation && (
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
        )}

        <PlaybackSettingsMenu
          allowedSpeeds={allowedPlaybackSpeeds}
          playback={playback}
        />
      </CollapsibleGroup>
    </>
  );
};
