import { css, cva } from "@hashintel/ds-helpers/css";
import { use, useEffect, useRef, useState } from "react";
import { IoMdPause, IoMdPlay } from "react-icons/io";
import { MdOutlinePlayArrow, MdRotateLeft } from "react-icons/md";
import {
  TbArrowBarToRight,
  TbChartLine,
  TbClock,
  TbInfinity,
  TbSettings,
} from "react-icons/tb";

import { PopoverMenuItem } from "../../../../components/popover-menu-item";
import {
  PopoverPanel,
  PopoverSection,
} from "../../../../components/popover-panel";
import {
  formatPlaybackSpeed,
  PLAYBACK_SPEEDS,
  PlaybackContext,
  type PlaybackSpeed,
} from "../../../../playback/context";
import { SimulationContext } from "../../../../simulation/context";
import { EditorContext } from "../../../../state/editor-context";
import { ToolbarButton } from "./toolbar-button";

const frameInfoStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  fontSize: "[10px]",
  color: "gray.60",
  fontWeight: "medium",
  lineHeight: "[1]",
  width: "[90px]",
  fontVariantNumeric: "tabular-nums",
  overflow: "hidden",
  whiteSpace: "nowrap",
});

const elapsedTimeStyle = css({
  fontSize: "[9px]",
  color: "gray.50",
  marginTop: "[2px]",
});

const frameIndexStyle = css({
  fontSize: "[11px]",
  color: "gray.50",
  letterSpacing: "[-0.2px]",
  marginTop: "[1px]",
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

const settingsButtonContainerStyle = css({
  position: "relative",
});

const popoverContainerStyle = css({
  position: "absolute",
  bottom: "[100%]",
  left: "[50%]",
  transform: "translateX(-50%)",
  marginBottom: "2",
  zIndex: 1000,
});

const popoverPanelStyle = css({
  width: "[280px]",
});

const speedGridStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  paddingX: "[8px]",
  paddingBottom: "[4px]",
});

const speedButtonStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "[8px]",
    fontSize: "[14px]",
    fontWeight: "medium",
    color: "gray.90",
    backgroundColor: "[transparent]",
    border: "none",
    borderRadius: "md.4",
    cursor: "pointer",
    _hover: {
      backgroundColor: "gray.10",
    },
  },
  variants: {
    selected: {
      true: {
        backgroundColor: "bg.accent.subtle",
        _hover: {
          backgroundColor: "bg.accent.subtle",
        },
      },
    },
  },
});

const maxTimeInputStyle = css({
  width: "[60px]",
  height: "[24px]",
  padding: "[0 6px]",
  fontSize: "[13px]",
  fontWeight: "medium",
  textAlign: "right",
  color: "gray.90",
  backgroundColor: "gray.10",
  border: "[1px solid]",
  borderColor: "gray.20",
  borderRadius: "md.3",
  outline: "none",
  flexShrink: 0,
  fontVariantNumeric: "tabular-nums",
  _focus: {
    borderColor: "blue.50",
    boxShadow: "[0 0 0 2px rgba(59, 130, 246, 0.2)]",
  },
  "&::-webkit-inner-spin-button, &::-webkit-outer-spin-button": {
    appearance: "none",
    margin: "[0]",
  },
});

const maxTimeUnitStyle = css({
  fontSize: "[12px]",
  color: "gray.50",
});

const toolbarDividerStyle = css({
  background: "gray.20",
  width: "[1px]",
  height: "[16px]",
  margin: "[0 4px]",
});

const menuItemIconStyle = css({
  fontSize: "[14px]",
  color: "gray.50",
  flexShrink: 0,
});

interface SimulationControlsProps {
  disabled?: boolean;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  disabled = false,
}) => {
  const {
    state: simulationState,
    reset,
    maxTime,
    setMaxTime,
  } = use(SimulationContext);

  const {
    currentViewedFrame,
    currentFrameIndex,
    totalFrames,
    playbackState,
    playbackSpeed,
    playMode,
    isViewOnlyAvailable,
    isComputeAvailable,
    setCurrentViewedFrame,
    play: playbackPlay,
    pause: playbackPause,
    setPlaybackSpeed,
    setPlayMode,
  } = use(PlaybackContext);

  const { setBottomPanelOpen, setActiveBottomPanelTab } = use(EditorContext);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Derive stopping condition from maxTime
  const stoppingCondition: "indefinitely" | "fixed" =
    maxTime === null ? "indefinitely" : "fixed";

  const handleStoppingConditionChange = (
    condition: "indefinitely" | "fixed",
  ) => {
    if (condition === "indefinitely") {
      setMaxTime(null);
    } else {
      // Set default of 10 seconds when switching to fixed time
      setMaxTime(10);
    }
  };

  // Close popover when clicking outside
  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const menuElement = menuRef.current;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuElement && !menuElement.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleFocusOut = (event: FocusEvent) => {
      if (menuElement && !menuElement.contains(event.relatedTarget as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    menuElement?.addEventListener("focusout", handleFocusOut);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      menuElement?.removeEventListener("focusout", handleFocusOut);
    };
  }, [isMenuOpen]);

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

  // Split speeds into two rows of 4
  const speedRows: PlaybackSpeed[][] = [
    PLAYBACK_SPEEDS.slice(0, 4),
    PLAYBACK_SPEEDS.slice(4),
  ];

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
          <div className={toolbarDividerStyle} />
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

          <div className={toolbarDividerStyle} />
        </>
      )}

      {/* Settings button with popover */}
      <div ref={menuRef} className={settingsButtonContainerStyle}>
        <ToolbarButton
          tooltip="Playback settings"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          ariaLabel="Playback settings"
          ariaExpanded={isMenuOpen}
        >
          <TbSettings />
        </ToolbarButton>

        {/* Playback settings menu */}
        {isMenuOpen && (
          <div className={popoverContainerStyle}>
            <PopoverPanel
              title="Playback Controls"
              onClose={() => setIsMenuOpen(false)}
              className={popoverPanelStyle}
            >
              {/* When pressing play section */}
              <PopoverSection title="When pressing play">
                <PopoverMenuItem
                  icon={<MdOutlinePlayArrow className={menuItemIconStyle} />}
                  label="Play computed steps only"
                  isSelected={playMode === "viewOnly"}
                  isDisabled={!isViewOnlyAvailable}
                  onClick={() => isViewOnlyAvailable && setPlayMode("viewOnly")}
                />
                <PopoverMenuItem
                  icon={<TbChartLine className={menuItemIconStyle} />}
                  label="Play + compute buffer"
                  isSelected={playMode === "computeBuffer"}
                  isDisabled={!isComputeAvailable}
                  onClick={() =>
                    isComputeAvailable && setPlayMode("computeBuffer")
                  }
                />
                <PopoverMenuItem
                  icon={<TbArrowBarToRight className={menuItemIconStyle} />}
                  label="Play + compute max"
                  isSelected={playMode === "computeMax"}
                  isDisabled={!isComputeAvailable}
                  onClick={() =>
                    isComputeAvailable && setPlayMode("computeMax")
                  }
                />
              </PopoverSection>

              {/* Playback speed section */}
              <PopoverSection title="Playback speed">
                {speedRows.map((row) => (
                  <div key={row[0]} className={speedGridStyle}>
                    {row.map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        className={speedButtonStyle({
                          selected: speed === playbackSpeed,
                        })}
                        onClick={() => setPlaybackSpeed(speed)}
                      >
                        {formatPlaybackSpeed(speed)}
                      </button>
                    ))}
                  </div>
                ))}
              </PopoverSection>

              {/* Stopping conditions section */}
              <PopoverSection title="Stopping conditions" showDivider={false}>
                <PopoverMenuItem
                  icon={<TbInfinity className={menuItemIconStyle} />}
                  label="Run indefinitely"
                  isSelected={stoppingCondition === "indefinitely"}
                  isDisabled={hasSimulation}
                  onClick={() =>
                    !hasSimulation &&
                    handleStoppingConditionChange("indefinitely")
                  }
                />
                <PopoverMenuItem
                  icon={<TbClock className={menuItemIconStyle} />}
                  label="End at fixed time"
                  isSelected={stoppingCondition === "fixed"}
                  isDisabled={hasSimulation}
                  onClick={() =>
                    !hasSimulation && handleStoppingConditionChange("fixed")
                  }
                  trailingContent={
                    stoppingCondition === "fixed" ? (
                      <>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={maxTime ?? 10}
                          disabled={hasSimulation}
                          onChange={(event) => {
                            const value = Number.parseFloat(event.target.value);
                            if (!Number.isNaN(value) && value > 0) {
                              setMaxTime(value);
                            }
                          }}
                          onClick={(event) => event.stopPropagation()}
                          className={maxTimeInputStyle}
                          aria-label="Maximum simulation time in seconds"
                        />
                        <span className={maxTimeUnitStyle}>s</span>
                      </>
                    ) : undefined
                  }
                />
              </PopoverSection>
            </PopoverPanel>
          </div>
        )}
      </div>
    </>
  );
};
