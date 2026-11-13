import { use, useRef, useState } from "react";

import { Button, Icon, NumberInput, Popover } from "@hashintel/ds-components";
import { css, cva, cx } from "@hashintel/ds-helpers/css";
import {
  formatPlaybackSpeed,
  PLAYBACK_SPEEDS,
  type PlaybackSpeed,
} from "@hashintel/petrinaut-core";

import { EventPlaybackContext } from "../../../../../react/event-playback/context";
import { SimulationContext } from "../../../../../react/simulation/context";
import {
  acceptsRunEnd,
  runEndOf,
} from "../../../../../react/simulation/run-end";
import { UserSettingsContext } from "../../../../../react/state/user-settings-context";
import { SettingsIcon } from "../../../../experimental-icons";
import { usePetrinautPresentation } from "../../../shared/presentation-context";
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

export type PlaybackSettingsMenuProps = {
  allowedSpeeds?: readonly PlaybackSpeed[];
};

/**
 * What the speeds and the fixed end are called and bounded by, per clock. A
 * timed run plays at a multiple of real time and ends at a time. An untimed
 * run plays a number of steps per second and ends at a step.
 */
const CLOCK_SETTINGS = {
  time: {
    speedLabel: "Playback speed",
    formatSpeed: formatPlaybackSpeed,
    endLabel: "End at fixed time",
    endUnit: "s",
    endInputLabel: "Maximum simulation time in seconds",
    endNeeded: "A Stochastic simulation needs an end time",
    endMin: 0.1,
    endStep: 0.1,
  },
  steps: {
    speedLabel: "Steps per second",
    formatSpeed: (speed: PlaybackSpeed) =>
      speed === Number.POSITIVE_INFINITY ? "Max" : String(speed),
    endLabel: "End at step",
    endUnit: "",
    endInputLabel: "Step the run ends at",
    endNeeded: "A Stochastic simulation needs a step to end at",
    endMin: 1,
    endStep: 1,
  },
} as const;

const toSpeedRows = (speeds: readonly PlaybackSpeed[]): PlaybackSpeed[][] => {
  const rows: PlaybackSpeed[][] = [];
  for (let index = 0; index < speeds.length; index += 4) {
    rows.push(speeds.slice(index, index + 4));
  }
  return rows;
};

export const PlaybackSettingsMenu = ({
  allowedSpeeds = PLAYBACK_SPEEDS,
}: PlaybackSettingsMenuProps) => {
  const presentation = usePetrinautPresentation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { enableExperimentalIconPack } = use(UserSettingsContext);
  const playModesVisible = !presentation.compactControls;
  const stoppingConditionsVisible = !presentation.compactControls;
  const speedRows = toSpeedRows(allowedSpeeds);

  const {
    state: simulationState,
    mode,
    clock,
    maxTime,
    setMaxTime,
  } = use(SimulationContext);
  const settings = CLOCK_SETTINGS[clock];

  const {
    playbackSpeed,
    playMode,
    isViewOnlyAvailable,
    isComputeAvailable,
    setPlaybackSpeed,
    setPlayMode,
  } = use(EventPlaybackContext);

  const hasSimulation = simulationState !== "NotRun";
  // Many runs are compared at the same times, so they always have an end.
  const needsEndTime = mode === "stochastic";

  // Derive stopping condition from maxTime
  const stoppingCondition: "indefinitely" | "fixed" =
    maxTime === null ? "indefinitely" : "fixed";

  const handleStoppingConditionChange = (
    condition: "indefinitely" | "fixed",
  ) => {
    if (condition === "indefinitely") {
      setMaxTime(null);
    } else {
      // Ten seconds, or ten steps, when switching to a fixed end
      setMaxTime(10);
    }
  };

  return (
    <>
      <ToolbarButton
        ref={triggerRef}
        data-state={open ? "open" : "closed"}
        tooltip="Playback settings"
        ariaLabel="Playback settings"
        ariaExpanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {enableExperimentalIconPack ? (
          <SettingsIcon open={open} duration={240} />
        ) : (
          <Icon name="gear" />
        )}
      </ToolbarButton>
      {open && (
        <Popover
          triggerRef={triggerRef}
          position="top"
          onClose={() => setOpen(false)}
        >
          <Popover.Container className={contentWidthStyle}>
            {[
              <Popover.Header key="header" title="Playback Controls" />,
              ...(playModesVisible
                ? [
                    <Popover.Body
                      key="play-modes"
                      className={sectionInnerStyle}
                    >
                      <div className={sectionLabelStyle}>
                        When pressing play
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={menuItemStyle({
                          selected: playMode === "viewOnly",
                          disabled: !isViewOnlyAvailable,
                        })}
                        onClick={() =>
                          isViewOnlyAvailable && setPlayMode("viewOnly")
                        }
                        aria-disabled={!isViewOnlyAvailable}
                        tooltip={
                          !isViewOnlyAvailable
                            ? "Available when there are computed frames"
                            : undefined
                        }
                      >
                        <Icon
                          name="play"
                          className={menuItemIconStyle}
                          size="sm"
                        />
                        <span className={menuItemTextStyle}>
                          Play computed steps only
                        </span>
                        {playMode === "viewOnly" && (
                          <Icon
                            name="check"
                            className={checkIconStyle}
                            size="sm"
                          />
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
                        <span className={menuItemTextStyle}>
                          Play + compute buffer
                        </span>
                        {playMode === "computeBuffer" && (
                          <Icon
                            name="check"
                            className={checkIconStyle}
                            size="sm"
                          />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={menuItemStyle({
                          selected: playMode === "computeMax",
                          disabled: !isComputeAvailable,
                        })}
                        onClick={() =>
                          isComputeAvailable && setPlayMode("computeMax")
                        }
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
                        <span className={menuItemTextStyle}>
                          Play + compute max
                        </span>
                        {playMode === "computeMax" && (
                          <Icon
                            name="check"
                            className={checkIconStyle}
                            size="sm"
                          />
                        )}
                      </Button>
                      <div className={popoverDividerStyle} />
                    </Popover.Body>,
                  ]
                : []),

              <Popover.Body
                key="playback-speed"
                withPadding={false}
                className={sectionInnerStyle}
              >
                <div className={sectionLabelStyle}>{settings.speedLabel}</div>
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
                        {settings.formatSpeed(speed)}
                      </Button>
                    ))}
                  </div>
                ))}
                {stoppingConditionsVisible && (
                  <div className={popoverDividerStyle} />
                )}
              </Popover.Body>,

              ...(stoppingConditionsVisible
                ? [
                    <Popover.Body
                      key="stopping-conditions"
                      withPadding={false}
                      className={sectionInnerStyle}
                    >
                      <div className={sectionLabelStyle}>
                        Stopping conditions
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={menuItemStyle({
                          selected: stoppingCondition === "indefinitely",
                          disabled: hasSimulation || needsEndTime,
                        })}
                        onClick={() =>
                          !hasSimulation &&
                          !needsEndTime &&
                          handleStoppingConditionChange("indefinitely")
                        }
                        aria-disabled={hasSimulation || needsEndTime}
                        tooltip={
                          hasSimulation
                            ? "Reset simulation to change stopping conditions"
                            : needsEndTime
                              ? settings.endNeeded
                              : undefined
                        }
                      >
                        <Icon
                          name="infinity"
                          className={menuItemIconStyle}
                          size="sm"
                        />
                        <span className={menuItemTextStyle}>
                          Run indefinitely
                        </span>
                        {stoppingCondition === "indefinitely" && (
                          <Icon
                            name="check"
                            className={checkIconStyle}
                            size="sm"
                          />
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
                          !hasSimulation &&
                          handleStoppingConditionChange("fixed")
                        }
                        aria-disabled={hasSimulation}
                        tooltip={
                          hasSimulation
                            ? "Reset simulation to change stopping conditions"
                            : undefined
                        }
                      >
                        <Icon
                          name="clock"
                          className={menuItemIconStyle}
                          size="sm"
                        />
                        <span className={menuItemTextStyle}>
                          {settings.endLabel}
                        </span>
                        {stoppingCondition === "fixed" && (
                          <>
                            <NumberInput
                              size="sm"
                              min={settings.endMin}
                              step={settings.endStep}
                              value={runEndOf(clock, maxTime ?? 10)}
                              align="right"
                              hideStepper
                              disabled={hasSimulation}
                              onChange={(nextMaxTime) => {
                                if (
                                  nextMaxTime !== null &&
                                  acceptsRunEnd(clock, nextMaxTime)
                                ) {
                                  setMaxTime(nextMaxTime);
                                }
                              }}
                              onClick={(event) => event.stopPropagation()}
                              className={maxTimeInputStyle}
                              aria-label={settings.endInputLabel}
                            />
                            <span
                              style={{
                                fontSize: "12px",
                                color: "var(--colors-neutral-s100)",
                              }}
                            >
                              {settings.endUnit}
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
                    </Popover.Body>,
                  ]
                : []),
            ]}
          </Popover.Container>
        </Popover>
      )}
    </>
  );
};
