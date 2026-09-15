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
 * show where it went: they are disabled, and the status line names the step;
 * once the study settles the line keeps its outcome.
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
import { formatCount } from "../shared/format-value";
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
  display: "flex",
  flexDirection: "column",
  gap: "[6px]",
});

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  "@container drawer-frame-body (max-width: 599px)": { flexWrap: "wrap" },
});

const nameStyle = css({
  fontSize: "xs",
  color: "neutral.s110",
  width: "[140px]",
  flexShrink: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  "@container drawer-frame-body (max-width: 599px)": { width: "full" },
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
  "@container drawer-frame-body (max-width: 599px)": { paddingLeft: "0" },
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
    ? "Sampling selected ranges"
    : "Sampling selected values";
  const { following } = status;
  const sampling = status.computing
    ? ` · ${formatCount(status.runsSampled)} / ${formatCount(status.runTarget ?? status.runCount)} runs`
    : "";

  return (
    <div className={statusStyle}>
      {/* The spinner spans a driving study's gap between two steps as well. */}
      <span
        className={spinnerSlotStyle}
        data-idle={!status.computing && following?.kind !== "following"}
      >
        <LoadingSpinner size="xs" />
      </span>
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
        <span>Choose parameter values or ranges to see results.</span>
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
  return (
    <div className={navigatorStyle}>
      {axes.map((axis) => (
        <div className={rowStyle} key={axis.identifier}>
          <span className={nameStyle} title={axisDisplayName(axis)}>
            {axisDisplayName(axis)}
          </span>
          <AxisControl
            axis={axis}
            disabled={disabled}
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
