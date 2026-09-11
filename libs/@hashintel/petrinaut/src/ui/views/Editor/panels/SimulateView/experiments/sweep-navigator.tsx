/**
 * The parameter navigator of a sweep: one slider row per swept parameter,
 * plus a status line. Each slider selects a position range on the
 * parameter's quantized interval — the whole interval by default,
 * collapsible to a single point — and committing a move reports the new
 * selection so the owner can redirect compute to it. In the experiment
 * drawer this is the Parameters card's content, under the header.
 *
 * Purely presentational: selection and progress come in as props, and the
 * only output is `onSelectionChange`. Slider moves commit live — positions
 * are quantized, so a drag emits one change per step crossed and compute
 * follows the thumb. While an optimizer drives the sweep the controls only
 * show where it went: they are disabled, and the status line names the step.
 */
import {
  LoadingSpinner,
  SegmentedControl,
  Slider,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  axisDisplayName,
  axisStep,
  axisValueAt,
} from "../../../../../../react/experiments/parameter-grid";
import { formatAxisValue } from "../shared/format-axis-value";
import { RangeSlider } from "./sweep-navigator/range-slider";

import type {
  ExperimentParameterAxis,
  SweepAxisSelection,
  SweepSelection,
} from "../../../../../../react/experiments/parameter-grid";

/** Progress shown under the sliders. */
export type SweepNavigatorStatus = {
  /** Whether a batch is currently running for the selection. */
  computing: boolean;
  /**
   * The optimizer step the selection follows, when a study drives the
   * sweep: the controls are disabled and show its point. Null otherwise.
   */
  following: { step: number; total: number } | null;
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
  display: "flex",
  flexDirection: "column",
  gap: "[6px]",
});

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
});

const nameStyle = css({
  fontSize: "xs",
  color: "neutral.s110",
  width: "[140px]",
  flexShrink: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const readoutStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  fontVariantNumeric: "tabular-nums",
  color: "neutral.s120",
  width: "[128px]",
  flexShrink: 0,
  textAlign: "right",
});

const sliderStyle = css({
  flex: "1",
});

// One line whatever the band's width, so a change of wording never moves
// what follows the band.
const statusStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
  // Aligns under the sliders: the 140px name column plus the row gap.
  paddingLeft: "[148px]",
  minWidth: "[0]",
  fontSize: "xs",
  color: "neutral.s80",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  height: "[16px]",
  "& > span:last-child": {
    minWidth: "[0]",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
});

const spinnerSlotStyle = css({
  display: "inline-flex",
  "&[data-idle=true]": { visibility: "hidden" },
});

const AxisControl = ({
  axis,
  selected,
  disabled,
  onSelect,
}: {
  axis: ExperimentParameterAxis;
  selected: SweepAxisSelection;
  disabled: boolean;
  onSelect: (range: SweepAxisSelection) => void;
}) => {
  const isPoint = selected.from === selected.to;

  const commitPoint = (position: number) => {
    if (position !== selected.from || position !== selected.to) {
      onSelect({ from: position, to: position });
    }
  };
  const commitRange = (range: [number, number]) => {
    if (range[0] !== selected.from || range[1] !== selected.to) {
      onSelect({ from: range[0], to: range[1] });
    }
  };

  return (
    <>
      <SegmentedControl
        size="xs"
        disabled={disabled}
        aria-label={`${axisDisplayName(axis)} selection mode`}
        items={[
          { value: "range", label: "Range" },
          { value: "point", label: "Point" },
        ]}
        value={isPoint ? "point" : "range"}
        onChange={(mode) => {
          if (mode === "point" && !isPoint) {
            // Collapse to the middle of the current range.
            const middle = Math.round((selected.from + selected.to) / 2);
            onSelect({ from: middle, to: middle });
          } else if (mode === "range" && isPoint) {
            // Expand back to the whole interval.
            onSelect({ from: 0, to: axis.stepCount });
          }
        }}
      />
      {isPoint ? (
        // A single thumb, not a collapsed RangeSlider: coincident range
        // thumbs trap the drag on the upper one, which cannot move left.
        <Slider
          className={sliderStyle}
          variant="plain"
          min={0}
          max={axis.stepCount}
          step={1}
          value={selected.from}
          disabled={disabled}
          aria-label={axisDisplayName(axis)}
          onChange={commitPoint}
        />
      ) : (
        <RangeSlider
          className={sliderStyle}
          min={0}
          max={axis.stepCount}
          step={1}
          value={[selected.from, selected.to]}
          disabled={disabled}
          aria-label={axisDisplayName(axis)}
          onChange={commitRange}
        />
      )}
      <span className={readoutStyle}>
        {isPoint
          ? formatAxisValue(axisValueAt(axis, selected.from), axisStep(axis))
          : `${formatAxisValue(axisValueAt(axis, selected.from), axisStep(axis))} – ${formatAxisValue(axisValueAt(axis, selected.to), axisStep(axis))}`}
      </span>
    </>
  );
};

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
    ? "sampling across the selected ranges"
    : "refining while you stay here";

  return (
    <div className={statusStyle}>
      <span className={spinnerSlotStyle} data-idle={!status.computing}>
        <LoadingSpinner size="xs" />
      </span>
      {status.following ? (
        <span>
          Following step {status.following.step} of {status.following.total}
          {status.computing
            ? ` — ${status.runsSampled} of ${status.runTarget ?? status.runCount} runs`
            : ""}
        </span>
      ) : status.computing ? (
        <span>
          {status.runsSampled} of {status.runTarget ?? status.runCount} runs —{" "}
          {activity}
        </span>
      ) : status.runsCompleted === 0 ? (
        <span>move a control or click the surface to compute a point</span>
      ) : (
        <span>
          {status.runsCompleted} of {status.runCount} runs
          {status.runsCompleted >= status.runCount ? " — fully sampled" : ""}
        </span>
      )}
    </div>
  );
};

export const SweepNavigator = ({
  axes,
  selection,
  status,
  onSelectionChange,
  disabled = false,
}: {
  axes: readonly ExperimentParameterAxis[];
  selection: SweepSelection;
  status: SweepNavigatorStatus;
  onSelectionChange: (selection: SweepSelection) => void;
  disabled?: boolean;
}) => {
  return (
    <div className={navigatorStyle}>
      {axes.map((axis) => (
        <div className={rowStyle} key={axis.identifier}>
          <span className={nameStyle} title={axisDisplayName(axis)}>
            {axisDisplayName(axis)}
          </span>
          <AxisControl
            axis={axis}
            disabled={disabled || status.following !== null}
            selected={
              selection[axis.identifier] ?? {
                from: 0,
                to: axis.stepCount,
              }
            }
            onSelect={(range) =>
              onSelectionChange({
                ...selection,
                [axis.identifier]: range,
              })
            }
          />
        </div>
      ))}
      <SamplingStatus selection={selection} status={status} />
    </div>
  );
};
