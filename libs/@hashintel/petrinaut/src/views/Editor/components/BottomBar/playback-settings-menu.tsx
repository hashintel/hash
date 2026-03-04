import { css, cva } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { MdCheck, MdOutlinePlayArrow } from "react-icons/md";
import {
  TbArrowBarToRight,
  TbChartLine,
  TbClock,
  TbInfinity,
  TbSettings,
} from "react-icons/tb";

import { NumberInput } from "../../../../components/number-input";
import { Popover } from "../../../../components/popover";
import {
  formatPlaybackSpeed,
  PLAYBACK_SPEEDS,
  PlaybackContext,
  type PlaybackSpeed,
} from "../../../../playback/context";
import { SimulationContext } from "../../../../simulation/context";
import { ToolbarButton } from "./toolbar-button";

const contentWidthStyle = css({
  width: "[280px]",
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
  fontSize: "[14px]",
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
  fontSize: "[14px]",
  color: "blue.s50",
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
    color: "neutral.s120",
    backgroundColor: "[transparent]",
    border: "none",
    borderRadius: "[8px]",
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
  marginTop: "[4px]",
});

const maxTimeInputStyle = css({
  width: "[60px]",
  textAlign: "right",
  flexShrink: 0,
  fontVariantNumeric: "tabular-nums",
});

// Split speeds into two rows of 4
const speedRows: PlaybackSpeed[][] = [
  PLAYBACK_SPEEDS.slice(0, 4),
  PLAYBACK_SPEEDS.slice(4),
];

export const PlaybackSettingsMenu = () => {
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
    <Popover.Root
      positioning={{ placement: "top", gutter: 8 }}
      lazyMount
      unmountOnExit
    >
      <Popover.Trigger asChild>
        <span style={{ display: "inline-flex" }}>
          <ToolbarButton
            tooltip="Playback settings"
            ariaLabel="Playback settings"
          >
            <TbSettings />
          </ToolbarButton>
        </span>
      </Popover.Trigger>

      <Popover.Content className={contentWidthStyle}>
        <Popover.Header>Playback Controls</Popover.Header>

        {/* When pressing play section */}
        <Popover.Section>
          <Popover.SectionCard>
            <Popover.SectionLabel>When pressing play</Popover.SectionLabel>
            <button
              type="button"
              className={menuItemStyle({
                selected: playMode === "viewOnly",
                disabled: !isViewOnlyAvailable,
              })}
              onClick={() => isViewOnlyAvailable && setPlayMode("viewOnly")}
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
              onClick={() => isComputeAvailable && setPlayMode("computeBuffer")}
              aria-disabled={!isComputeAvailable}
              title={
                !isComputeAvailable
                  ? "Not available when simulation is complete"
                  : undefined
              }
            >
              <TbChartLine className={menuItemIconStyle} />
              <span className={menuItemTextStyle}>Play + compute buffer</span>
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
              onClick={() => isComputeAvailable && setPlayMode("computeMax")}
              aria-disabled={!isComputeAvailable}
              title={
                !isComputeAvailable
                  ? "Not available when simulation is complete"
                  : undefined
              }
            >
              <TbArrowBarToRight className={menuItemIconStyle} />
              <span className={menuItemTextStyle}>Play + compute max</span>
              {playMode === "computeMax" && (
                <MdCheck className={checkIconStyle} />
              )}
            </button>
            <div className={popoverDividerStyle} />
          </Popover.SectionCard>
        </Popover.Section>

        {/* Playback speed section */}
        <Popover.Section>
          <Popover.SectionCard>
            <Popover.SectionLabel>Playback speed</Popover.SectionLabel>
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
          </Popover.SectionCard>
        </Popover.Section>

        {/* Stopping conditions section */}
        <Popover.Section>
          <Popover.SectionCard>
            <Popover.SectionLabel>Stopping conditions</Popover.SectionLabel>
            <button
              type="button"
              className={menuItemStyle({
                selected: stoppingCondition === "indefinitely",
                disabled: hasSimulation,
              })}
              onClick={() =>
                !hasSimulation && handleStoppingConditionChange("indefinitely")
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
                  <NumberInput
                    size="xs"
                    min={0.1}
                    step={0.1}
                    value={maxTime ?? 10}
                    disabled={hasSimulation}
                    onChange={(event) => {
                      const value = Number.parseFloat(
                        (event.target as HTMLInputElement).value,
                      );
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
                      color: "var(--colors-neutral-s100)",
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
          </Popover.SectionCard>
        </Popover.Section>
      </Popover.Content>
    </Popover.Root>
  );
};
