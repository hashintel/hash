import { RefractivePane } from "@hashintel/ds-components/refractive-pane";
import { css } from "@hashintel/ds-helpers/css";
import { useEffect } from "react";
import { FaArrowPointer, FaCircle, FaHand, FaSquare } from "react-icons/fa6";
import { TbPlayerSkipForward } from "react-icons/tb";

import { Tooltip } from "../../../components/tooltip";
import type { EditorState } from "../../../state/editor-store";
import { useSimulationStore } from "../../../state/simulation-provider";

type EditorMode = EditorState["globalMode"];
type EditorEditionMode = EditorState["editionMode"];

interface BottomBarProps {
  mode: EditorMode;
  editionMode: EditorEditionMode;
  onEditionModeChange: (mode: EditorEditionMode) => void;
}

export const BottomBar: React.FC<BottomBarProps> = ({
  mode,
  editionMode,
  onEditionModeChange,
}) => {
  const simulation = useSimulationStore((state) => state.simulation);
  const simulationState = useSimulationStore((state) => state.state);
  const step = useSimulationStore((state) => state.step);

  const hasSimulation = simulation !== null;
  const currentFrame = simulation?.currentFrameNumber ?? 0;
  const totalFrames = simulation?.frames.length ?? 0;

  // Fallback to 'pan' mode when switching to simulate mode if mutative mode
  useEffect(() => {
    if (
      mode === "simulate" &&
      (editionMode === "add-place" || editionMode === "add-transition")
    ) {
      onEditionModeChange("pan");
    }
  }, [mode, editionMode, onEditionModeChange]);

  // Keyboard shortcuts for switching modes
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Don't trigger if focus is in an input, textarea, or contentEditable element
      const target = event.target as HTMLElement;
      const isInputFocused =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (isInputFocused) {
        return;
      }

      // Check that no modifier keys are pressed
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
        return;
      }

      // Switch modes based on key
      switch (event.key.toLowerCase()) {
        // If escape is pressed, switch to select mode
        case "escape":
          event.preventDefault();
          onEditionModeChange("select");
          break;
        case "v":
          event.preventDefault();
          onEditionModeChange("select");
          break;
        case "h":
          event.preventDefault();
          onEditionModeChange("pan");
          break;
        case "n":
          if (mode === "edit") {
            event.preventDefault();
            onEditionModeChange("add-place");
          }
          break;
        case "t":
          if (mode === "edit") {
            event.preventDefault();
            onEditionModeChange("add-transition");
          }
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mode, onEditionModeChange]);

  function getIconContainerStyle(itemMode: EditorEditionMode) {
    const isSelected = editionMode === itemMode;
    return css({
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "[50px]",
      height: "[50px]",
      fontSize: "[24px]",
      color: isSelected ? "[#3b82f6]" : "core.gray.70",
      transition: "[all 0.2s ease]",
      "&:hover": {
        color: isSelected ? "[#2563eb]" : "core.gray.90",
        transform: "[scale(1.1)]",
      },
    });
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
      }}
    >
      <RefractivePane
        radius={12}
        blur={1.5}
        specularOpacity={0}
        scaleRatio={1}
        bezelWidth={20}
        glassThickness={120}
        refractiveIndex={1.5}
        className={css({
          padding: "spacing.4",
          paddingX: "spacing.6",
          borderRadius: "[12px]",
          backgroundColor: "[rgba(255, 255, 255, 0.8)]",
          boxShadow: "[0 4px 16px rgba(0, 0, 0, 0.15)]",
          display: "flex",
          alignItems: "center",
          gap: "spacing.4",
        })}
      >
        <Tooltip content="Select (V)">
          <div
            className={getIconContainerStyle("select")}
            onClick={() => onEditionModeChange("select")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onEditionModeChange("select");
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Select mode"
          >
            <FaArrowPointer />
          </div>
        </Tooltip>
        <Tooltip content="Pan (H)">
          <div
            className={getIconContainerStyle("pan")}
            onClick={() => onEditionModeChange("pan")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onEditionModeChange("pan");
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Pan mode"
          >
            <FaHand />
          </div>
        </Tooltip>

        {mode === "edit" && (
          <>
            <Tooltip content="Add Place (N)">
              <div
                className={getIconContainerStyle("add-place")}
                onClick={() => onEditionModeChange("add-place")}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onEditionModeChange("add-place");
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label="Add place mode"
              >
                <FaCircle />
              </div>
            </Tooltip>
            <Tooltip content="Add Transition (T)">
              <div
                className={getIconContainerStyle("add-transition")}
                onClick={() => onEditionModeChange("add-transition")}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onEditionModeChange("add-transition");
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label="Add transition mode"
              >
                <FaSquare />
              </div>
            </Tooltip>
          </>
        )}
        {hasSimulation && mode === "simulate" && (
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
                gap: "spacing.3",
                paddingX: "spacing.2",
              })}
            >
              <span
                className={css({
                  fontSize: "[11px]",
                  color: "core.gray.60",
                  fontWeight: "[500]",
                  minWidth: "[60px]",
                })}
              >
                Frame {currentFrame + 1} / {totalFrames}
              </span>
              <input
                type="range"
                min="0"
                max={Math.max(0, totalFrames - 1)}
                value={currentFrame}
                disabled
                className={css({
                  width: "[120px]",
                  height: "[4px]",
                  appearance: "none",
                  background: "core.gray.30",
                  borderRadius: "[2px]",
                  outline: "none",
                  cursor: "not-allowed",
                  "&::-webkit-slider-thumb": {
                    appearance: "none",
                    width: "[12px]",
                    height: "[12px]",
                    borderRadius: "[50%]",
                    background: "core.blue.50",
                    cursor: "not-allowed",
                  },
                  "&::-moz-range-thumb": {
                    width: "[12px]",
                    height: "[12px]",
                    borderRadius: "[50%]",
                    background: "core.blue.50",
                    cursor: "not-allowed",
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
                      step();
                    }
                  }}
                  disabled={
                    simulationState === "Error" ||
                    simulationState === "Complete"
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
        )}
        <div
          className={css({
            background: "core.gray.20",
            width: "[1px]",
            height: "[40px]",
          })}
        />
      </RefractivePane>
    </div>
  );
};
