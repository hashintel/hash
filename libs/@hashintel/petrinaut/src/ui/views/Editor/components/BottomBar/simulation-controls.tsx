import { use } from "react";

import { Icon } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { PlaybackContext } from "../../../../../react/playback/context";
import { SimulationContext } from "../../../../../react/simulation/context";
import { EditorContext } from "../../../../../react/state/editor-context";
import { usePetrinautPresentation } from "../../../shared/presentation-context";
import { CollapsibleGroup } from "./collapsible-group";
import { PlaybackSettingsMenu } from "./playback-settings-menu";
import { formatPlaybackTimes, playbackTimes } from "./playback-time";
import { ToolbarButton } from "./toolbar-button";
import { ToolbarDivider } from "./toolbar-divider";

import type { PlaybackSpeed } from "../../../../../react/playback/context";

// Elapsed over total, stacked, so the readout costs the bar a column of
// digits rather than a row of them. Wide enough for the longest run either bar
// will show, so the controls either side hold still while the numbers run.
const timeReadoutStyle = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
    width: "[58px]",
    lineHeight: "[1.15]",
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "[-0.2px]",
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  variants: {
    compact: {
      true: { width: "[54px]" },
    },
  },
});

const elapsedTimeStyle = css({
  fontSize: "[11px]",
  fontWeight: "medium",
  color: "neutral.s110",
});

const totalTimeStyle = css({
  fontSize: "[9px]",
  color: "neutral.s95",
});

const sliderStyle = cva({
  base: {
    // Sized to the space available rather than to a fixed 300px: `clamp`
    // tracks the viewport continuously, so a window or iframe resize slides
    // the scrubber's width with it instead of stepping at a breakpoint, and
    // `flex` lets it take any slack the row has left over once the bar is
    // wider than its content.
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

export interface SimulationControlsProps {
  disabled?: boolean;
  inSubnet?: boolean;
  allowedPlaybackSpeeds?: readonly PlaybackSpeed[];
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  disabled = false,
  inSubnet = false,
  allowedPlaybackSpeeds,
}) => {
  const presentation = usePetrinautPresentation();
  const { dt, state: simulationState, reset } = use(SimulationContext);

  const {
    currentViewedFrame,
    currentFrameIndex,
    totalFrames,
    playbackState,
    setCurrentViewedFrame,
    play: playbackPlay,
    pause: playbackPause,
  } = use(PlaybackContext);

  const { setBottomPanelOpen, setActiveBottomPanelTab } = use(EditorContext);

  const isDisabled = disabled;

  const openDiagnosticsPanel = () => {
    setActiveBottomPanelTab("diagnostics");
    setBottomPanelOpen(true);
  };

  const hasSimulation = simulationState !== "NotRun";
  const isSimulationComplete = simulationState === "Complete";
  const isSimulationErrored = simulationState === "Error";
  const isPlaybackPlaying = playbackState === "Playing";
  const frameIndex = currentFrameIndex;
  const times = formatPlaybackTimes(
    playbackTimes({
      frameIndex: currentViewedFrame ? frameIndex : 0,
      totalFrames,
      dt,
    }),
    dt,
  );

  // Disable play button when at the last frame and simulation is complete or errored
  const isAtLastFrame = totalFrames > 0 && frameIndex >= totalFrames - 1;
  const isPlayDisabled =
    isDisabled ||
    inSubnet ||
    ((isSimulationComplete || isSimulationErrored) && isAtLastFrame);

  const getPlayPauseTooltip = () => {
    if (inSubnet) {
      return "Return to the root net to run simulation";
    }
    if (isDisabled) {
      return "Fix errors to run simulation";
    }
    if ((isSimulationComplete || isSimulationErrored) && isAtLastFrame) {
      return "Playback finished - Reset to run again";
    }
    if (simulationState === "NotRun") {
      return "Start Simulation";
    }
    if (isPlaybackPlaying) {
      return "Pause Playback";
    }
    return "Play";
  };

  const getPlayPauseAriaLabel = () => {
    if (inSubnet) {
      return "Return to root net to run simulation";
    }
    if (isDisabled) {
      return "Fix errors to run simulation";
    }
    if ((isSimulationComplete || isSimulationErrored) && isAtLastFrame) {
      return "Playback finished";
    }
    if (simulationState === "NotRun") {
      return "Run simulation";
    }
    if (isPlaybackPlaying) {
      return "Pause playback";
    }
    return "Play";
  };

  const handlePlayPause = () => {
    // If disabled due to errors, open diagnostics panel instead
    if (isDisabled && !inSubnet) {
      openDiagnosticsPanel();
      return;
    }

    if (isPlaybackPlaying) {
      // Pause playback
      playbackPause();
    } else {
      // Start/resume playback (PlaybackProvider handles NotRun case with proper backpressure)
      void playbackPlay();
    }
  };

  const handleReset = () => {
    reset();
  };

  return (
    <>
      {/* Stop button - only visible when simulation exists */}
      {hasSimulation && (
        <CollapsibleGroup>
          <ToolbarButton
            tooltip="Stop simulation"
            onClick={handleReset}
            disabled={isDisabled}
            ariaLabel="Reset simulation"
          >
            <Icon name="rotateLeft" />
          </ToolbarButton>
          <ToolbarDivider />
        </CollapsibleGroup>
      )}

      {/* Play/Pause button - always visible */}
      <ToolbarButton
        tooltip={getPlayPauseTooltip()}
        onClick={handlePlayPause}
        disabled={isPlayDisabled}
        ariaLabel={getPlayPauseAriaLabel()}
      >
        {isPlaybackPlaying ? (
          <Icon name="pauseFilled" />
        ) : (
          <Icon name="playFilled" />
        )}
      </ToolbarButton>

      {/* Frame controls - only visible when simulation exists - and the
          playback settings, which the bar hides first when it runs short of
          room: the scrubber is the widest thing on it. */}
      <CollapsibleGroup>
        {hasSimulation && (
          <>
            <div
              aria-label={`Elapsed ${times.elapsed} of ${times.total}`}
              className={timeReadoutStyle({
                compact: presentation.compactControls,
              })}
            >
              <span className={elapsedTimeStyle}>{times.elapsed}</span>
              <span className={totalTimeStyle}>/ {times.total}</span>
            </div>

            <input
              type="range"
              min="0"
              max={Math.max(0, totalFrames - 1)}
              value={frameIndex}
              disabled={isDisabled}
              onChange={(event) =>
                setCurrentViewedFrame(Number(event.target.value))
              }
              className={sliderStyle({ compact: presentation.compactControls })}
            />

            <ToolbarDivider />
          </>
        )}

        <PlaybackSettingsMenu allowedSpeeds={allowedPlaybackSpeeds} />
      </CollapsibleGroup>
    </>
  );
};
