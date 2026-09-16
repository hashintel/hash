import { LoadingSpinner, Slider } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  axisStep,
  axisValueAt,
  pointSweepSelection,
} from "../../../../../../react/experiments/parameter-grid";
import { formatAxisValue } from "../shared/format-axis-value";
import { formatCount } from "../shared/format-value";
import { parameterLabel } from "./shared/parameter-label";

import type {
  ExperimentParameterAxis,
  SweepSelection,
} from "../../../../../../react/experiments/parameter-grid";

/** Progress shown under the sliders. */
export type SweepNavigatorStatus = {
  /** Whether a batch is currently running for the selection. */
  computing: boolean;
  /**
   * The study behind the selection: the step it follows while a study
   * drives the sweep, or the settled study's outcome in one line. Null when
   * no study was started.
   */
  following:
    | { kind: "following"; step: number; total: number }
    | { kind: "settled"; summary: string }
    | null;
  /** Runs finished for the selection so far. */
  runsCompleted: number;
  /** Runs finished within the currently running batch's target. */
  runsSampled: number;
  /** The running batch's run target; null when idle. */
  runTarget: number | null;
  /** The selection's full run budget, reached when sampling saturates. */
  runCount: number;
};

const navigatorStyle = css({
  containerType: "inline-size",
  display: "flex",
  flexDirection: "column",
  gap: "3",
});

const controlsStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  columnGap: "8",
  rowGap: "4",
  "@container (max-width: 639px)": {
    gridTemplateColumns: "minmax(0, 1fr)",
  },
});

const rowStyle = css({
  position: "relative",
  minWidth: "[0]",
});

const readoutStyle = css({
  position: "absolute",
  top: "[0]",
  right: "[0]",
  paddingX: "2",
  minWidth: "[56px]",
  borderRadius: "md",
  backgroundColor: "neutral.s20",
  fontSize: "xs",
  lineHeight: "[20px]",
  fontWeight: "medium",
  fontVariantNumeric: "tabular-nums",
  color: "neutral.s120",
  textAlign: "right",
});

const sliderStyle = css({
  gap: "2",
  "& [data-part=label]": {
    paddingRight: "[88px]",
    fontSize: "sm",
    lineHeight: "[20px]",
    color: "neutral.s110",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

const boundsStyle = css({
  display: "flex",
  justifyContent: "space-between",
  marginTop: "1",
  fontSize: "[11px]",
  lineHeight: "[14px]",
  fontVariantNumeric: "tabular-nums",
  color: "neutral.s90",
});

const statusStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
  minWidth: "[0]",
  fontSize: "xs",
  color: "neutral.s90",
  fontVariantNumeric: "tabular-nums",
  height: "[16px]",
  "& > span:last-child": {
    minWidth: "[0]",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

const SamplingStatus = ({
  selection,
  status,
}: {
  selection: SweepSelection;
  status: SweepNavigatorStatus;
}) => {
  const isRange = Object.values(selection).some(
    (range) => range.from !== range.to,
  );
  const activity = isRange
    ? "Sampling selected ranges"
    : "Sampling selected values";
  const { following } = status;
  const sampling = status.computing
    ? ` · ${formatCount(status.runsSampled)} / ${formatCount(status.runTarget ?? status.runCount)} runs`
    : "";

  return (
    <div className={statusStyle}>
      {status.computing || following?.kind === "following" ? (
        <LoadingSpinner size="xs" />
      ) : null}
      {following?.kind === "following" ? (
        <span>
          Testing step {following.step}
          {sampling}
        </span>
      ) : following?.kind === "settled" && !status.computing ? (
        <span>
          {following.summary}
          {sampling}
        </span>
      ) : status.computing ? (
        <span>
          {activity}
          {sampling}
        </span>
      ) : status.runsCompleted === 0 ? (
        <span>Move a slider to explore results.</span>
      ) : (
        <span>
          {formatCount(status.runsCompleted)}{" "}
          {status.runsCompleted === 1 ? "run" : "runs"} sampled
        </span>
      )}
    </div>
  );
};

export const SweepNavigator = ({
  axes,
  selection,
  status,
  disabled,
  onSelectionChange,
}: {
  axes: readonly ExperimentParameterAxis[];
  selection: SweepSelection;
  status: SweepNavigatorStatus;
  /** The controls only show the selection: a study drives it, or the experiment is over. */
  disabled: boolean;
  onSelectionChange: (selection: SweepSelection) => void;
}) => {
  const points = pointSweepSelection(axes, selection);

  return (
    <div className={navigatorStyle}>
      <div className={controlsStyle}>
        {axes.map((axis) => {
          const position =
            points[axis.identifier]?.from ?? Math.round(axis.stepCount / 2);
          return (
            <div
              className={rowStyle}
              key={axis.identifier}
              title={axis.identifier}
            >
              <Slider
                className={sliderStyle}
                variant="plain"
                label={parameterLabel(axis)}
                min={0}
                max={axis.stepCount}
                step={1}
                value={position}
                disabled={disabled}
                onChange={(nextPosition) => {
                  if (!disabled) {
                    onSelectionChange({
                      ...points,
                      [axis.identifier]: {
                        from: nextPosition,
                        to: nextPosition,
                      },
                    });
                  }
                }}
              />
              <span className={readoutStyle}>
                {formatAxisValue(axisValueAt(axis, position), axisStep(axis))}
              </span>
              <div className={boundsStyle}>
                <span>{formatAxisValue(axis.min, axisStep(axis))}</span>
                <span>{formatAxisValue(axis.max, axisStep(axis))}</span>
              </div>
            </div>
          );
        })}
      </div>
      <SamplingStatus selection={selection} status={status} />
    </div>
  );
};
