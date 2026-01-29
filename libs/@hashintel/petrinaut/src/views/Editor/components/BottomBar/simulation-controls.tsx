import { css, cva } from "@hashintel/ds-helpers/css";
import { AnimatePresence, motion } from "motion/react";
import { use, useEffect, useRef, useState } from "react";
import { IoMdPause, IoMdPlay } from "react-icons/io";
import { MdCheck, MdOutlinePlayArrow, MdRotateLeft } from "react-icons/md";
import {
  TbArrowBarToRight,
  TbChartLine,
  TbClock,
  TbInfinity,
  TbSettings,
  TbX,
} from "react-icons/tb";

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

// Popover styles
const popoverContainerStyle = css({
  position: "absolute",
  bottom: "[100%]",
  left: "[50%]",
  transform: "translateX(-50%)",
  marginBottom: "2",
  zIndex: 1000,
});

const popoverStyle = css({
  backgroundColor: "gray.10",
  borderRadius: "[12px]",
  boxShadow:
    "[0px 0px 0px 1px rgba(0, 0, 0, 0.08), 0px 4px 6px -1px rgba(0, 0, 0, 0.1), 0px 10px 15px -3px rgba(0, 0, 0, 0.1), 0px 20px 25px -5px rgba(0, 0, 0, 0.1)]",
  overflow: "hidden",
  width: "[280px]",
});

const popoverHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  paddingX: "[12px]",
  paddingY: "[8px]",
});

const popoverTitleStyle = css({
  fontSize: "[12px]",
  fontWeight: "medium",
  color: "gray.50",
  textTransform: "uppercase",
  letterSpacing: "[0.48px]",
});

const closeButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[24px]",
  height: "[24px]",
  fontSize: "[14px]",
  color: "gray.50",
  backgroundColor: "[transparent]",
  border: "none",
  borderRadius: "[6px]",
  cursor: "pointer",
  _hover: {
    backgroundColor: "[rgba(0, 0, 0, 0.05)]",
  },
});

const sectionStyle = css({
  paddingX: "[4px]",
  paddingBottom: "[4px]",
});

const sectionCardStyle = css({
  backgroundColor: "[white]",
  borderRadius: "[8px]",
  boxShadow:
    "[0px 0px 0px 1px rgba(0, 0, 0, 0.06), 0px 1px 1px -0.5px rgba(0, 0, 0, 0.04), 0px 4px 4px -12px rgba(0, 0, 0, 0.02), 0px 12px 12px -6px rgba(0, 0, 0, 0.02)]",
  overflow: "hidden",
  padding: "[4px]",
});

const sectionLabelStyle = css({
  fontSize: "[12px]",
  fontWeight: "medium",
  color: "gray.50",
  paddingX: "[8px]",
  paddingTop: "[8px]",
  paddingBottom: "[6px]",
});

const menuItemStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "[8px]",
    width: "[100%]",
    minWidth: "[130px]",
    height: "[28px]",
    paddingX: "[8px]",
    borderRadius: "[8px]",
    fontSize: "[14px]",
    fontWeight: "medium",
    color: "gray.90",
    backgroundColor: "[transparent]",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    _hover: {
      backgroundColor: "gray.10",
    },
  },
  variants: {
    selected: {
      true: {
        backgroundColor: "blue.20",
        _hover: {
          backgroundColor: "blue.20",
        },
      },
    },
    disabled: {
      true: {
        opacity: "[0.4]",
        cursor: "not-allowed",
        _hover: {
          backgroundColor: "[transparent]",
        },
      },
    },
  },
});

const menuItemIconStyle = css({
  fontSize: "[14px]",
  color: "gray.50",
  flexShrink: 0,
});

const menuItemTextStyle = css({
  flex: "[1]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const checkIconStyle = css({
  fontSize: "[14px]",
  color: "blue.50",
  flexShrink: 0,
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
    borderRadius: "[8px]",
    cursor: "pointer",
    _hover: {
      backgroundColor: "gray.10",
    },
  },
  variants: {
    selected: {
      true: {
        backgroundColor: "blue.20",
        _hover: {
          backgroundColor: "blue.20",
        },
      },
    },
  },
});

const popoverDividerStyle = css({
  height: "[1px]",
  backgroundColor: "gray.10",
  marginTop: "[4px]",
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
  borderRadius: "[6px]",
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

const toolbarDividerStyle = css({
  background: "gray.20",
  width: "[1px]",
  height: "[16px]",
  margin: "[0 4px]",
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
    dt,
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

  const hasSimulation = simulation !== null;
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

    if (simulationState === "NotRun") {
      // Initialize and start simulation computation
      // PlaybackProvider will auto-start playback when simulation starts running
      initialize({
        seed: Date.now(),
        dt,
      });
      setTimeout(() => {
        run();
      }, 0);
    } else if (isPlaybackPlaying) {
      // Pause playback
      playbackPause();
    } else {
      // Start/resume playback
      playbackPlay();
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

  const animationConfig = {
    initial: { opacity: 0, scale: 0.8, width: 0 },
    animate: { opacity: 1, scale: 1, width: "auto" },
    exit: { opacity: 0, scale: 0.8, width: 0 },
    transition: { duration: 0.2, ease: "easeInOut" as const },
  };

  const dividerAnimationConfig = {
    initial: { opacity: 0, scaleY: 0 },
    animate: { opacity: 1, scaleY: 1 },
    exit: { opacity: 0, scaleY: 0 },
    transition: { duration: 0.15, ease: "easeInOut" as const },
  };

  return (
    <>
      {/* Stop button - only visible when simulation exists */}
      <AnimatePresence>
        {hasSimulation && (
          <motion.div
            key="reset-section"
            layout
            style={{ display: "flex", alignItems: "center", gap: "inherit" }}
            {...animationConfig}
          >
            <ToolbarButton
              tooltip="Stop simulation"
              onClick={handleReset}
              disabled={isDisabled}
              ariaLabel="Reset simulation"
            >
              <MdRotateLeft />
            </ToolbarButton>
            <motion.div
              className={toolbarDividerStyle}
              {...dividerAnimationConfig}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Play/Pause button - always visible */}
      <motion.div layout>
        <ToolbarButton
          tooltip={getPlayPauseTooltip()}
          onClick={handlePlayPause}
          disabled={isPlayDisabled}
          ariaLabel={getPlayPauseAriaLabel()}
        >
          {isPlaybackPlaying ? <IoMdPause /> : <IoMdPlay />}
        </ToolbarButton>
      </motion.div>

      {/* Frame controls - only visible when simulation exists */}
      <AnimatePresence>
        {hasSimulation && (
          <motion.div
            key="frame-controls"
            layout
            style={{ display: "flex", alignItems: "center", gap: "inherit" }}
            {...animationConfig}
          >
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

            <motion.div
              className={toolbarDividerStyle}
              {...dividerAnimationConfig}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings button with popover */}
      <motion.div layout ref={menuRef} className={settingsButtonContainerStyle}>
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
            <div className={popoverStyle}>
              {/* Header */}
              <div className={popoverHeaderStyle}>
                <span className={popoverTitleStyle}>Playback Controls</span>
                <button
                  type="button"
                  className={closeButtonStyle}
                  onClick={() => setIsMenuOpen(false)}
                  aria-label="Close menu"
                >
                  <TbX />
                </button>
              </div>

              {/* When pressing play section */}
              <div className={sectionStyle}>
                <div className={sectionCardStyle}>
                  <div className={sectionLabelStyle}>When pressing play</div>
                  <button
                    type="button"
                    className={menuItemStyle({
                      selected: playMode === "viewOnly",
                      disabled: !isViewOnlyAvailable,
                    })}
                    onClick={() =>
                      isViewOnlyAvailable && setPlayMode("viewOnly")
                    }
                    aria-disabled={!isViewOnlyAvailable}
                    title={
                      !isViewOnlyAvailable
                        ? "Available when there are computed frames"
                        : undefined
                    }
                  >
                    <MdOutlinePlayArrow className={menuItemIconStyle} />
                    <span className={menuItemTextStyle}>
                      Play computed steps only
                    </span>
                    {playMode === "viewOnly" && (
                      <MdCheck className={checkIconStyle} />
                    )}
                  </button>
                  <button
                    type="button"
                    className={menuItemStyle({
                      selected: playMode === "computeBuffer",
                      disabled: !isComputeAvailable,
                    })}
                    onClick={() =>
                      isComputeAvailable && setPlayMode("computeBuffer")
                    }
                    aria-disabled={!isComputeAvailable}
                    title={
                      !isComputeAvailable
                        ? "Not available when simulation is complete"
                        : undefined
                    }
                  >
                    <TbChartLine className={menuItemIconStyle} />
                    <span className={menuItemTextStyle}>
                      Play + compute buffer
                    </span>
                    {playMode === "computeBuffer" && (
                      <MdCheck className={checkIconStyle} />
                    )}
                  </button>
                  <button
                    type="button"
                    className={menuItemStyle({
                      selected: playMode === "computeMax",
                      disabled: !isComputeAvailable,
                    })}
                    onClick={() =>
                      isComputeAvailable && setPlayMode("computeMax")
                    }
                    aria-disabled={!isComputeAvailable}
                    title={
                      !isComputeAvailable
                        ? "Not available when simulation is complete"
                        : undefined
                    }
                  >
                    <TbArrowBarToRight className={menuItemIconStyle} />
                    <span className={menuItemTextStyle}>
                      Play + compute max
                    </span>
                    {playMode === "computeMax" && (
                      <MdCheck className={checkIconStyle} />
                    )}
                  </button>
                  <div className={popoverDividerStyle} />
                </div>
              </div>

              {/* Playback speed section */}
              <div className={sectionStyle}>
                <div className={sectionCardStyle}>
                  <div className={sectionLabelStyle}>Playback speed</div>
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
                  <div className={popoverDividerStyle} />
                </div>
              </div>

              {/* Stopping conditions section */}
              <div className={sectionStyle}>
                <div className={sectionCardStyle}>
                  <div className={sectionLabelStyle}>Stopping conditions</div>
                  <button
                    type="button"
                    className={menuItemStyle({
                      selected: stoppingCondition === "indefinitely",
                      disabled: hasSimulation,
                    })}
                    onClick={() =>
                      !hasSimulation &&
                      handleStoppingConditionChange("indefinitely")
                    }
                    aria-disabled={hasSimulation}
                    title={
                      hasSimulation
                        ? "Reset simulation to change stopping conditions"
                        : undefined
                    }
                  >
                    <TbInfinity className={menuItemIconStyle} />
                    <span className={menuItemTextStyle}>Run indefinitely</span>
                    {stoppingCondition === "indefinitely" && (
                      <MdCheck className={checkIconStyle} />
                    )}
                  </button>
                  <button
                    type="button"
                    className={menuItemStyle({
                      selected: stoppingCondition === "fixed",
                      disabled: hasSimulation,
                    })}
                    onClick={() =>
                      !hasSimulation && handleStoppingConditionChange("fixed")
                    }
                    aria-disabled={hasSimulation}
                    title={
                      hasSimulation
                        ? "Reset simulation to change stopping conditions"
                        : undefined
                    }
                  >
                    <TbClock className={menuItemIconStyle} />
                    <span className={menuItemTextStyle}>End at fixed time</span>
                    {stoppingCondition === "fixed" && (
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
                        <span
                          style={{
                            fontSize: "12px",
                            color: "var(--colors-gray-50)",
                          }}
                        >
                          s
                        </span>
                      </>
                    )}
                    {stoppingCondition !== "fixed" && (
                      <MdCheck
                        className={checkIconStyle}
                        style={{ visibility: "hidden" }}
                      />
                    )}
                  </button>
                  <div className={popoverDividerStyle} />
                </div>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </>
  );
};
