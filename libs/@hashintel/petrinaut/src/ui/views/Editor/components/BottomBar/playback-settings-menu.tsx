import { use, useRef, useState, type ReactNode } from "react";

import {
  Button,
  Icon,
  NumberInput,
  Popover,
  type IconName,
} from "@hashintel/ds-components";
import { css, cva, cx } from "@hashintel/ds-helpers/css";
import { SettingsIcon } from "@hashintel/ds-icons";
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

const hiddenStyle = css({ visibility: "hidden" });

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

type PlaybackSettingsMenuProps = {
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

/**
 * One choice of the popover. A choice that cannot be made now says why in
 * its tooltip. `children` replace the check mark of the selected choice.
 */
const SettingsRow = ({
  iconName,
  label,
  selected,
  disabledReason,
  onSelect,
  children,
}: {
  iconName: IconName;
  label: string;
  selected: boolean;
  disabledReason?: string;
  onSelect: () => void;
  children?: ReactNode;
}) => (
  <Button
    variant="ghost"
    size="sm"
    className={menuItemStyle({
      selected,
      disabled: disabledReason !== undefined,
    })}
    onClick={() => {
      if (disabledReason === undefined) {
        onSelect();
      }
    }}
    aria-disabled={disabledReason !== undefined}
    tooltip={disabledReason}
  >
    <Icon name={iconName} className={menuItemIconStyle} size="sm" />
    <span className={menuItemTextStyle}>{label}</span>
    {children ??
      (selected && <Icon name="check" className={checkIconStyle} size="sm" />)}
  </Button>
);

export const PlaybackSettingsMenu = ({
  allowedSpeeds = PLAYBACK_SPEEDS,
}: PlaybackSettingsMenuProps) => {
  const presentation = usePetrinautPresentation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
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

  const viewOnlyUnavailable = isViewOnlyAvailable
    ? undefined
    : "Available when there are computed frames";
  const computeUnavailable = isComputeAvailable
    ? undefined
    : "Not available when simulation is complete";
  const endLocked =
    simulationState === "NotRun"
      ? undefined
      : "Reset simulation to change stopping conditions";
  // Many runs are compared at the same times, so they always have an end.
  const endNeeded = mode === "stochastic" ? settings.endNeeded : undefined;

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
        <SettingsIcon open={open} duration={240} />
      </ToolbarButton>
      {open && (
        <Popover
          triggerRef={triggerRef}
          position="top"
          onClose={() => setOpen(false)}
        >
          <Popover.Container className={contentWidthStyle}>
            {[
              // The container takes panels only, so an optional one is spread in.
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
                      <SettingsRow
                        iconName="play"
                        label="Play computed steps only"
                        selected={playMode === "viewOnly"}
                        disabledReason={viewOnlyUnavailable}
                        onSelect={() => setPlayMode("viewOnly")}
                      />
                      <SettingsRow
                        iconName="chartLine"
                        label="Play + compute buffer"
                        selected={playMode === "computeBuffer"}
                        disabledReason={computeUnavailable}
                        onSelect={() => setPlayMode("computeBuffer")}
                      />
                      <SettingsRow
                        iconName="rightToLine"
                        label="Play + compute max"
                        selected={playMode === "computeMax"}
                        disabledReason={computeUnavailable}
                        onSelect={() => setPlayMode("computeMax")}
                      />
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
                      <SettingsRow
                        iconName="infinity"
                        label="Run indefinitely"
                        selected={maxTime === null}
                        disabledReason={endLocked ?? endNeeded}
                        onSelect={() => setMaxTime(null)}
                      />
                      <SettingsRow
                        iconName="clock"
                        label={settings.endLabel}
                        selected={maxTime !== null}
                        disabledReason={endLocked}
                        // Ten seconds, or ten steps, when switching to a fixed end.
                        onSelect={() => setMaxTime(10)}
                      >
                        {maxTime === null ? (
                          // Keeps the row as wide as the one above it.
                          <Icon
                            name="check"
                            className={cx(checkIconStyle, hiddenStyle)}
                            size="sm"
                          />
                        ) : (
                          <>
                            <NumberInput
                              size="sm"
                              min={settings.endMin}
                              step={settings.endStep}
                              value={runEndOf(clock, maxTime)}
                              align="right"
                              hideStepper
                              disabled={endLocked !== undefined}
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
                      </SettingsRow>
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
