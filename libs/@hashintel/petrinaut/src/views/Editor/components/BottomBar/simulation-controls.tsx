import { css } from "@hashintel/ds-helpers/css";
import { BiRun } from "react-icons/bi";
import { TbCircle, TbRefresh, TbSquare } from "react-icons/tb";

import { Tooltip } from "../../../../components/tooltip";
import { FEATURE_FLAGS } from "../../../../feature-flags";
import { useSimulationStore } from "../../../../state/simulation-provider";

const containerStyle = css({
  display: "flex",
  alignItems: "center",
  padding: "[0 12px]",
  gap: "[12px]",
});

const playPauseButtonStyle = css({
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[32px]",
  height: "[32px]",
  borderRadius: "[50%]",
  border: "none",
  background: "core.red.50",
  color: "[white]",
  fontSize: "[20px]",
  transition: "[all 0.2s ease]",
  "&:hover:not(:disabled)": {
    background: "core.red.60",
    transform: "[scale(1.05)]",
  },
  "&:disabled": {
    opacity: "[0.5]",
    cursor: "not-allowed",
  },
});

const frameInfoStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  fontSize: "[11px]",
  color: "core.gray.60",
  fontWeight: "[500]",
  minWidth: "[80px]",
});

const elapsedTimeStyle = css({
  fontSize: "[10px]",
  color: "core.gray.50",
  marginTop: "[2px]",
});

const sliderStyle = css({
  width: "[400px]",
  height: "[4px]",
  appearance: "none",
  background: "core.gray.30",
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
    background: "core.blue.50",
    cursor: "pointer",
  },
  "&::-moz-range-thumb": {
    width: "[12px]",
    height: "[12px]",
    borderRadius: "[50%]",
    background: "core.blue.50",
    cursor: "pointer",
    border: "none",
  },
});

const resetButtonStyle = css({
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[36px]",
  height: "[36px]",
  borderRadius: "[6px]",
  border: "none",
  background: "[transparent]",
  color: "core.gray.80",
  fontSize: "[18px]",
  transition: "[all 0.2s ease]",
  "&:hover:not(:disabled)": {
    background: "core.gray.10",
    transform: "[scale(1.05)]",
  },
  "&:disabled": {
    opacity: "[0.5]",
    cursor: "not-allowed",
  },
});

interface SimulationControlsProps {
  disabled?: boolean;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  disabled = false,
}) => {
  const simulation = useSimulationStore((state) => state.simulation);
  const simulationState = useSimulationStore((state) => state.state);
  const reset = useSimulationStore((state) => state.reset);
  const initialize = useSimulationStore((state) => state.initialize);
  const run = useSimulationStore((state) => state.run);
  const pause = useSimulationStore((state) => state.pause);
  const dt = useSimulationStore((state) => state.dt);
  const currentlyViewedFrame = useSimulationStore(
    (state) => state.currentlyViewedFrame
  );
  const setCurrentlyViewedFrame = useSimulationStore(
    (state) => state.setCurrentlyViewedFrame
  );

  const isDisabled = disabled;

  const totalFrames = simulation?.frames.length ?? 0;
  const hasSimulation = simulation !== null;
  const isRunning = simulationState === "Running";
  const elapsedTime = simulation ? currentlyViewedFrame * simulation.dt : 0;

  const handlePlayPause = () => {
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
    <div className={containerStyle}>
      {/* Record/Stop button - always visible */}
      <Tooltip
        content={
          isDisabled
            ? "Fix errors to run simulation"
            : simulationState === "NotRun"
            ? "Start Simulation"
            : isRunning
            ? "Pause Simulation"
            : "Continue Simulation"
        }
      >
        <button
          type="button"
          onClick={handlePlayPause}
          disabled={isDisabled}
          className={playPauseButtonStyle}
          aria-label={
            simulationState === "NotRun"
              ? "Run simulation"
              : isRunning
              ? "Pause simulation"
              : "Continue simulation"
          }
        >
          {isRunning ? (
            <TbSquare style={{ fontSize: "14px" }} />
          ) : FEATURE_FLAGS.RUNNING_MAN_ICON ? (
            <BiRun style={{ fontSize: "20px", marginRight: 2 }} />
          ) : (
            <TbCircle style={{ fontSize: "14px" }} />
          )}
        </button>
      </Tooltip>

      {/* Frame controls - only visible when simulation exists */}
      {hasSimulation && (
        <>
          <span className={frameInfoStyle}>
            <div>Frame</div>
            <div>
              {currentlyViewedFrame + 1} / {totalFrames}
            </div>
            <div className={elapsedTimeStyle}>{elapsedTime.toFixed(3)}s</div>
          </span>
          <input
            type="range"
            min="0"
            max={Math.max(0, totalFrames - 1)}
            value={currentlyViewedFrame}
            disabled={isDisabled}
            onChange={(event) =>
              setCurrentlyViewedFrame(Number(event.target.value))
            }
            className={sliderStyle}
          />
        </>
      )}

      {/* Reset button - only visible when simulation exists */}
      {hasSimulation && (
        <Tooltip content="Reset">
          <button
            type="button"
            onClick={handleReset}
            disabled={isDisabled}
            className={resetButtonStyle}
            aria-label="Reset simulation"
          >
            <TbRefresh />
          </button>
        </Tooltip>
      )}
    </div>
  );
};
