import { css, cva } from "@hashintel/ds-helpers/css";
import { use, useEffect, useRef, useState } from "react";
import { IoMdPause, IoMdPlay } from "react-icons/io";
import {
  MdCheck,
  MdCheckBox,
  MdOutlinePlayArrow,
  MdRotateLeft,
} from "react-icons/md";
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
    "[0px 0px 0px 1px rgba(0, 0, 0, 0.06), 0px 1px 1px -0.5px rgba(0, 0, 0, 0.04), 0px 4px 4px -12px rgba(0, 0, 0, 0.02), 0px 12px 12px -6px rgba(0, 0, 0, 0.02)]",
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

const dividerStyle = css({
  height: "[1px]",
  backgroundColor: "gray.10",
  marginTop: "[4px]",
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
  } = use(SimulationContext);

  const {
    currentViewedFrame,
    currentFrameIndex,
    totalFrames,
    playbackState,
    playbackSpeed,
    setCurrentViewedFrame,
    play: playbackPlay,
    pause: playbackPause,
    setPlaybackSpeed,
  } = use(PlaybackContext);

  const { setBottomPanelOpen, setActiveBottomPanelTab } = use(EditorContext);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Dummy state for "When pressing play" option (UI only for now)
  const [whenPressingPlay, setWhenPressingPlay] = useState<
    "computed" | "buffer" | "max"
  >("computed");

  // Dummy state for "Stopping conditions" option (UI only for now)
  const [stoppingCondition, setStoppingCondition] = useState<
    "indefinitely" | "fixed" | "condition"
  >("fixed");

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

  return (
    <>
      {/* Play/Pause button - always visible */}
      <ToolbarButton
        tooltip={getPlayPauseTooltip()}
        onClick={handlePlayPause}
        disabled={isPlayDisabled}
        ariaLabel={getPlayPauseAriaLabel()}
      >
        {isPlaybackPlaying ? <IoMdPause /> : <IoMdPlay />}
      </ToolbarButton>

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
                      selected: whenPressingPlay === "computed",
                    })}
                    onClick={() => setWhenPressingPlay("computed")}
                  >
                    <MdOutlinePlayArrow className={menuItemIconStyle} />
                    <span className={menuItemTextStyle}>
                      Play computed steps only
                    </span>
                    {whenPressingPlay === "computed" && (
                      <MdCheck className={checkIconStyle} />
                    )}
                  </button>
                  <button
                    type="button"
                    className={menuItemStyle({
                      selected: whenPressingPlay === "buffer",
                    })}
                    onClick={() => setWhenPressingPlay("buffer")}
                  >
                    <TbChartLine className={menuItemIconStyle} />
                    <span className={menuItemTextStyle}>
                      Play + compute buffer
                    </span>
                    {whenPressingPlay === "buffer" && (
                      <MdCheck className={checkIconStyle} />
                    )}
                  </button>
                  <button
                    type="button"
                    className={menuItemStyle({
                      selected: whenPressingPlay === "max",
                    })}
                    onClick={() => setWhenPressingPlay("max")}
                  >
                    <TbArrowBarToRight className={menuItemIconStyle} />
                    <span className={menuItemTextStyle}>
                      Play + compute max
                    </span>
                    {whenPressingPlay === "max" && (
                      <MdCheck className={checkIconStyle} />
                    )}
                  </button>
                  <div className={dividerStyle} />
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
                  <div className={dividerStyle} />
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
                    })}
                    onClick={() => setStoppingCondition("indefinitely")}
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
                    })}
                    onClick={() => setStoppingCondition("fixed")}
                  >
                    <TbClock className={menuItemIconStyle} />
                    <span className={menuItemTextStyle}>
                      End at fixed steps/time
                    </span>
                    {stoppingCondition === "fixed" && (
                      <MdCheck className={checkIconStyle} />
                    )}
                  </button>
                  <button
                    type="button"
                    className={menuItemStyle({
                      selected: stoppingCondition === "condition",
                    })}
                    onClick={() => setStoppingCondition("condition")}
                  >
                    <MdCheckBox className={menuItemIconStyle} />
                    <span className={menuItemTextStyle}>
                      End when condition satisfied
                    </span>
                    {stoppingCondition === "condition" && (
                      <MdCheck className={checkIconStyle} />
                    )}
                  </button>
                  <div className={dividerStyle} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

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
