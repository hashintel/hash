import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";
import {
  IoMdCheckmarkCircleOutline,
  IoMdPause,
  IoMdPlay,
} from "react-icons/io";
import { MdRotateLeft } from "react-icons/md";

import { EditorContext } from "../../../../state/editor-context";
import { SimulationContext } from "../../../../state/simulation-context";
import { ToolbarButton } from "./toolbar-button";

const frameInfoStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  fontSize: "[11px]",
  color: "gray.60",
  fontWeight: "medium",
  lineHeight: "[1]",
  minWidth: "[80px]",
});

const elapsedTimeStyle = css({
  fontSize: "[10px]",
  color: "gray.50",
  marginTop: "[2px]",
});

const sliderStyle = css({
  width: "[400px]",
  height: "[4px]",
  appearance: "none",
  background: "gray.30",
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
    background: "blue.50",
    cursor: "pointer",
  },
  "&::-moz-range-thumb": {
    width: "[12px]",
    height: "[12px]",
    borderRadius: "[50%]",
    background: "blue.50",
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
  const {
    simulation,
    state: simulationState,
    reset,
    initialize,
    run,
    pause,
    dt,
    currentViewedFrame,
    setCurrentViewedFrame,
  } = use(SimulationContext);

  const { setBottomPanelOpen, setActiveBottomPanelTab } = use(EditorContext);

  const isDisabled = disabled;

  const openDiagnosticsPanel = () => {
    setActiveBottomPanelTab("diagnostics");
    setBottomPanelOpen(true);
  };

  const totalFrames = simulation?.frames.length ?? 0;
  const hasSimulation = simulation !== null;
  const isRunning = simulationState === "Running";
  const isComplete = simulationState === "Complete";
  const frameIndex = currentViewedFrame?.number ?? 0;
  const elapsedTime = currentViewedFrame?.time ?? 0;

  const getPlayPauseTooltip = () => {
    if (isDisabled) {
      return "Fix errors to run simulation";
    }
    if (simulationState === "NotRun") {
      return "Start Simulation";
    }
    if (simulationState === "Complete") {
      return "Simulation Complete - Reset to run again";
    }
    if (isRunning) {
      return "Pause Simulation";
    }
    return "Continue Simulation";
  };

  const getPlayPauseAriaLabel = () => {
    if (isDisabled) {
      return "Fix errors to run simulation";
    }
    if (simulationState === "NotRun") {
      return "Run simulation";
    }
    if (simulationState === "Complete") {
      return "Simulation complete";
    }
    if (isRunning) {
      return "Pause simulation";
    }
    return "Continue simulation";
  };

  const handlePlayPause = () => {
    // If disabled due to errors, open diagnostics panel instead
    if (isDisabled) {
      openDiagnosticsPanel();
      return;
    }

    if (simulationState === "NotRun") {
      // Initialize and start continuous simulation
      initialize({
        seed: Date.now(),
        dt,
      });
      // Run will be called after initialization completes
      setTimeout(() => {
        run();
      }, 0);
    } else if (isRunning) {
      // Pause the running simulation
      pause();
    } else if (simulationState === "Paused") {
      // Resume continuous simulation
      run();
    }
  };

  const handleReset = () => {
    reset();
  };

  return (
    <>
      {/* Play/Pause button - always visible */}
      <ToolbarButton
        tooltip={getPlayPauseTooltip()}
        onClick={handlePlayPause}
        disabled={isDisabled || isComplete}
        ariaLabel={getPlayPauseAriaLabel()}
      >
        {isComplete ? (
          <IoMdCheckmarkCircleOutline />
        ) : isRunning ? (
          <IoMdPause />
        ) : (
          <IoMdPlay />
        )}
      </ToolbarButton>

      {/* Frame controls - only visible when simulation exists */}
      {hasSimulation && (
        <>
          <div className={frameInfoStyle}>
            <div>Frame</div>
            <div>
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
        </>
      )}

      {/* Stop button - only visible when simulation exists */}
      {hasSimulation && (
        <ToolbarButton
          tooltip="Stop simulation"
          onClick={handleReset}
          disabled={isDisabled}
          ariaLabel="Reset simulation"
        >
          <MdRotateLeft />
        </ToolbarButton>
      )}
    </>
  );
};
