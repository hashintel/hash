import { use, useRef, useState } from "react";

import { Button, Icon, NumberInput, Popover } from "@hashintel/ds-components";
import { css, cva, cx } from "@hashintel/ds-helpers/css";

import {
  formatPlaybackSpeed,
  PLAYBACK_SPEEDS,
  PlaybackContext,
  type PlaybackSpeed,
} from "../../../../../react/playback/context";
import { SimulationContext } from "../../../../../react/simulation/context";
import { ToolbarButton } from "./toolbar-button";

const contentWidthStyle = css({
  width: "[280px]",
});

// The popover Body supplies the white card; this replicates the tight inner
// padding the old SectionCard applied around the menu rows.
const sectionInnerStyle = css({
  padding: "1 !important",
  paddingTop: "0 !important",
});

const sectionLabelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s100",
  paddingX: "2",
  paddingTop: "2",
  paddingBottom: "1.5",
});

const menuItemStyle = cva({
  base: {
    display: "flex !important",
    alignItems: "center",
    gap: "2",
    width: "[100%]",
    minWidth: "[130px]",
    height: "[28px]",
    paddingX: "2",
    borderRadius: "lg",
    fontSize: "sm",
    fontWeight: "medium",
    color: "neutral.s120",
    backgroundColor: "[transparent]",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    _hover: {
      backgroundColor: "neutral.s10",
    },
  },
  variants: {
    selected: {
      true: {
        backgroundColor: "blue.s20",
        _hover: {
          backgroundColor: "blue.s20",
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
  fontSize: "sm",
  color: "neutral.s100",
  flexShrink: 0,
});

const menuItemTextStyle = css({
  flex: "[1]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const checkIconStyle = css({
  color: "blue.s50",
});

const speedGridStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  paddingX: "2",
  paddingBottom: "1",
});

const speedButtonStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2",
    minWidth: "0",
    fontSize: "sm",
    fontWeight: "medium",
    color: "neutral.s120",
    backgroundColor: "[transparent]",
    border: "none",
    borderRadius: "lg",
    cursor: "pointer",
    _hover: {
      backgroundColor: "neutral.s10",
    },
  },
  variants: {
    selected: {
      true: {
        backgroundColor: "blue.s20",
        _hover: {
          backgroundColor: "blue.s20",
        },
      },
    },
  },
});

const popoverDividerStyle = css({
  height: "[1px]",
  backgroundColor: "[transparent]",
  marginTop: "1",
});

const maxTimeInputStyle = css({
  width: "[60px]",
  fontVariantNumeric: "tabular-nums",
});

// Split speeds into two rows of 4
const speedRows: PlaybackSpeed[][] = [
  PLAYBACK_SPEEDS.slice(0, 4),
  PLAYBACK_SPEEDS.slice(4),
];

export const PlaybackSettingsMenu = () => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const {
    state: simulationState,
    maxTime,
    setMaxTime,
  } = use(SimulationContext);

  const {
    playbackSpeed,
    playMode,
    isViewOnlyAvailable,
    isComputeAvailable,
    setPlaybackSpeed,
    setPlayMode,
  } = use(PlaybackContext);

  const hasSimulation = simulationState !== "NotRun";

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

  return (
    <>
      <ToolbarButton
        ref={triggerRef}
        tooltip="Playback settings"
        ariaLabel="Playback settings"
        ariaExpanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <Icon name="gear" />
      </ToolbarButton>
      {open && (
        <Popover
          triggerRef={triggerRef}
          position="top"
          onClose={() => setOpen(false)}
        >
          <Popover.Container className={contentWidthStyle}>
            <Popover.Header title="Playback Controls" />

            {/* When pressing play section */}
            <Popover.Body className={sectionInnerStyle}>
              <div className={sectionLabelStyle}>When pressing play</div>
              <Button
                variant="ghost"
                size="sm"
                className={menuItemStyle({
                  selected: playMode === "viewOnly",
                  disabled: !isViewOnlyAvailable,
                })}
                onClick={() => isViewOnlyAvailable && setPlayMode("viewOnly")}
                aria-disabled={!isViewOnlyAvailable}
                tooltip={
                  !isViewOnlyAvailable
                    ? "Available when there are computed frames"
                    : undefined
                }
              >
                <Icon name="play" className={menuItemIconStyle} size="sm" />
                <span className={menuItemTextStyle}>
                  Play computed steps only
                </span>
                {playMode === "viewOnly" && (
                  <Icon name="check" className={checkIconStyle} size="sm" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={menuItemStyle({
                  selected: playMode === "computeBuffer",
                  disabled: !isComputeAvailable,
                })}
                onClick={() =>
                  isComputeAvailable && setPlayMode("computeBuffer")
                }
                aria-disabled={!isComputeAvailable}
                tooltip={
                  !isComputeAvailable
                    ? "Not available when simulation is complete"
                    : undefined
                }
              >
                <Icon
                  name="chartLine"
                  className={menuItemIconStyle}
                  size="sm"
                />
                <span className={menuItemTextStyle}>Play + compute buffer</span>
                {playMode === "computeBuffer" && (
                  <Icon name="check" className={checkIconStyle} size="sm" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={menuItemStyle({
                  selected: playMode === "computeMax",
                  disabled: !isComputeAvailable,
                })}
                onClick={() => isComputeAvailable && setPlayMode("computeMax")}
                aria-disabled={!isComputeAvailable}
                tooltip={
                  !isComputeAvailable
                    ? "Not available when simulation is complete"
                    : undefined
                }
              >
                <Icon
                  name="rightToLine"
                  className={menuItemIconStyle}
                  size="sm"
                />
                <span className={menuItemTextStyle}>Play + compute max</span>
                {playMode === "computeMax" && (
                  <Icon name="check" className={checkIconStyle} size="sm" />
                )}
              </Button>
              <div className={popoverDividerStyle} />
            </Popover.Body>

            {/* Playback speed section */}
            <Popover.Body withPadding={false} className={sectionInnerStyle}>
              <div className={sectionLabelStyle}>Playback speed</div>
              {speedRows.map((row) => (
                <div key={row[0]} className={speedGridStyle}>
                  {row.map((speed) => (
                    <Button
                      key={speed}
                      variant="ghost"
                      size="sm"
                      className={speedButtonStyle({
                        selected: speed === playbackSpeed,
                      })}
                      onClick={() => setPlaybackSpeed(speed)}
                    >
                      {formatPlaybackSpeed(speed)}
                    </Button>
                  ))}
                </div>
              ))}
              <div className={popoverDividerStyle} />
            </Popover.Body>

            {/* Stopping conditions section */}
            <Popover.Body withPadding={false} className={sectionInnerStyle}>
              <div className={sectionLabelStyle}>Stopping conditions</div>
              <Button
                variant="ghost"
                size="sm"
                className={menuItemStyle({
                  selected: stoppingCondition === "indefinitely",
                  disabled: hasSimulation,
                })}
                onClick={() =>
                  !hasSimulation &&
                  handleStoppingConditionChange("indefinitely")
                }
                aria-disabled={hasSimulation}
                tooltip={
                  hasSimulation
                    ? "Reset simulation to change stopping conditions"
                    : undefined
                }
              >
                <Icon name="infinity" className={menuItemIconStyle} size="sm" />
                <span className={menuItemTextStyle}>Run indefinitely</span>
                {stoppingCondition === "indefinitely" && (
                  <Icon name="check" className={checkIconStyle} size="sm" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={menuItemStyle({
                  selected: stoppingCondition === "fixed",
                  disabled: hasSimulation,
                })}
                onClick={() =>
                  !hasSimulation && handleStoppingConditionChange("fixed")
                }
                aria-disabled={hasSimulation}
                tooltip={
                  hasSimulation
                    ? "Reset simulation to change stopping conditions"
                    : undefined
                }
              >
                <Icon name="clock" className={menuItemIconStyle} size="sm" />
                <span className={menuItemTextStyle}>End at fixed time</span>
                {stoppingCondition === "fixed" && (
                  <>
                    <NumberInput
                      size="sm"
                      min={0.1}
                      step={0.1}
                      value={maxTime ?? 10}
                      align="right"
                      hideStepper
                      disabled={hasSimulation}
                      onChange={(nextMaxTime) => {
                        if (nextMaxTime !== null && nextMaxTime > 0) {
                          setMaxTime(nextMaxTime);
                        }
                      }}
                      onClick={(event) => event.stopPropagation()}
                      className={maxTimeInputStyle}
                      aria-label="Maximum simulation time in seconds"
                    />
                    <span
                      style={{
                        fontSize: "12px",
                        color: "var(--colors-neutral-s100)",
                      }}
                    >
                      s
                    </span>
                  </>
                )}
                {stoppingCondition !== "fixed" && (
                  <Icon
                    name="check"
                    className={cx(
                      checkIconStyle,
                      css({ visibility: "hidden" }),
                    )}
                    size="sm"
                  />
                )}
              </Button>
              <div className={popoverDividerStyle} />
            </Popover.Body>
          </Popover.Container>
        </Popover>
      )}
    </>
  );
};
