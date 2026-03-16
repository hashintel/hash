import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { IoMdPause, IoMdPlay } from "react-icons/io";
import { MdRotateLeft } from "react-icons/md";

import { PlaybackContext } from "../../../../playback/context";
import { SimulationContext } from "../../../../simulation/context";
import { EditorContext } from "../../../../state/editor-context";
import { PlaybackSettingsMenu } from "./playback-settings-menu";
import { ToolbarButton } from "./toolbar-button";
import { ToolbarDivider } from "./toolbar-divider";

const frameInfoStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  fontSize: "[10px]",
  color: "neutral.s105",
  fontWeight: "medium",
  lineHeight: "[1]",
  width: "[90px]",
  fontVariantNumeric: "tabular-nums",
  overflow: "hidden",
  whiteSpace: "nowrap",
});

const elapsedTimeStyle = css({
  fontSize: "[9px]",
  color: "neutral.s100",
  marginTop: "[2px]",
});

const frameIndexStyle = css({
  fontSize: "[11px]",
  color: "neutral.s100",
  letterSpacing: "[-0.2px]",
  marginTop: "[1px]",
});

const sliderStyle = css({
  width: "[300px]",
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
});

interface SimulationControlsProps {
  disabled?: boolean;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  disabled = false,
}) => {
  const { state: simulationState, reset } = use(SimulationContext);

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
  const elapsedTime = currentViewedFrame?.time ?? 0;

  // Disable play button when at the last frame and simulation is complete or errored
  const isAtLastFrame = totalFrames > 0 && frameIndex >= totalFrames - 1;
  const isPlayDisabled =
    isDisabled ||
    ((isSimulationComplete || isSimulationErrored) && isAtLastFrame);

  const getPlayPauseTooltip = () => {
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
    if (isDisabled) {
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
        <>
          <ToolbarButton
            tooltip="Stop simulation"
            onClick={handleReset}
            disabled={isDisabled}
            ariaLabel="Reset simulation"
          >
            <MdRotateLeft />
          </ToolbarButton>
          <ToolbarDivider />
        </>
      )}

      {/* Play/Pause button - always visible */}
      <ToolbarButton
        tooltip={getPlayPauseTooltip()}
        onClick={handlePlayPause}
        disabled={isPlayDisabled}
        ariaLabel={getPlayPauseAriaLabel()}
      >
        {isPlaybackPlaying ? <IoMdPause /> : <IoMdPlay />}
      </ToolbarButton>

      {/* Frame controls - only visible when simulation exists */}
      {hasSimulation && (
        <>
          <div className={frameInfoStyle}>
            <div>Frame</div>
            <div className={frameIndexStyle}>
              {frameIndex + 1} / {totalFrames}
            </div>
            <div className={elapsedTimeStyle}>{elapsedTime.toFixed(3)}s</div>
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
            className={sliderStyle}
          />

          <ToolbarDivider />
        </>
      )}

      {/* Playback settings menu */}
      <PlaybackSettingsMenu />
    </>
  );
};
