import { css } from "@hashintel/ds-helpers/css";
import { TbPlayerSkipForward } from "react-icons/tb";

import { Tooltip } from "../../../../components/tooltip";
import type { SimulationState } from "../../../../state/simulation-store";

interface SimulationControlsProps {
  currentFrame: number;
  totalFrames: number;
  simulationState: SimulationState;
  currentlyViewedFrame: number;
  onStep: () => void;
  onFrameChange: (frameIndex: number) => void;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  totalFrames,
  simulationState,
  currentlyViewedFrame,
  onStep,
  onFrameChange,
}) => {
  return (
    <>
      <div
        className={css({
          background: "core.gray.20",
          width: "[1px]",
          height: "[40px]",
        })}
      />
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          paddingX: "spacing.2",
        })}
        style={{ paddingLeft: 12, gap: 12 }}
      >
        <span
          className={css({
            fontSize: "[11px]",
            color: "core.gray.60",
            fontWeight: "[500]",
            minWidth: "[60px]",
          })}
        >
          Frame {currentlyViewedFrame + 1} / {totalFrames}
        </span>
        <input
          type="range"
          min="0"
          max={Math.max(0, totalFrames - 1)}
          value={currentlyViewedFrame}
          onChange={(event) => onFrameChange(Number(event.target.value))}
          className={css({
            width: "[400px]",
            height: "[4px]",
            appearance: "none",
            background: "core.gray.30",
            borderRadius: "[2px]",
            outline: "none",
            cursor: "pointer",
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
          })}
        />
        <Tooltip content="Calculate Next Frame">
          <button
            type="button"
            onClick={() => {
              if (
                simulationState !== "Error" &&
                simulationState !== "Complete"
              ) {
                onStep();
              }
            }}
            disabled={
              simulationState === "Error" || simulationState === "Complete"
            }
            className={css({
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "[36px]",
              height: "[36px]",
              borderRadius: "[6px]",
              border: "none",
              background: "core.blue.50",
              color: "[white]",
              fontSize: "[18px]",
              transition: "[all 0.2s ease]",
              "&:hover:not(:disabled)": {
                background: "core.blue.60",
                transform: "[scale(1.05)]",
              },
              "&:disabled": {
                opacity: "[0.5]",
                cursor: "not-allowed",
              },
            })}
            aria-label="Calculate next frame"
          >
            <TbPlayerSkipForward />
          </button>
        </Tooltip>
      </div>
    </>
  );
};
