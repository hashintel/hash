/**
 * The parameter navigator of a sweep: one slider row per swept parameter,
 * plus a sampling status line. Each slider selects a position range on the
 * parameter's quantized interval — the whole interval by default,
 * collapsible to a single point — and committing a move reports the new
 * selection so the owner can redirect compute to it. In the experiment
 * drawer this strip lives in the section's sticky band and stays visible
 * while the charts scroll.
 *
 * Purely presentational: selection and sampling progress come in as props,
 * and the only output is `onSelectionChange`. Slider moves commit live —
 * positions are quantized, so a drag emits one change per step crossed and
 * compute follows the thumb.
 */
import { LoadingSpinner, SegmentedControl } from "@hashintel/ds-components";

import {
  LoadingSpinner,
  SegmentedControl,
  Slider,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { axisValueAt } from "../../../../../../react/experiments/parameter-grid";
import { formatAxisValue } from "../shared/format-axis-value";
import { RangeSlider } from "./sweep-navigator/range-slider";

import type {
  ExperimentParameterAxis,
  SweepAxisSelection,
  SweepSelection,
} from "../../../../../../react/experiments/parameter-grid";

/** Sampling progress shown under the sliders. */
export type SweepNavigatorStatus = {
  /** Whether a batch is currently running for the selection. */
  computing: boolean;
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
  fontWeight: "medium",
  color: "neutral.s120",
  width: "[140px]",
  flexShrink: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const readoutStyle = css({
  fontSize: "xs",
  fontVariantNumeric: "tabular-nums",
  color: "neutral.s100",
  width: "[128px]",
  flexShrink: 0,
  textAlign: "right",
});

const sliderStyle = css({
  flex: "1",
});

const statusStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
  // Aligns under the sliders: the 140px name column plus the row gap.
  paddingLeft: "[148px]",
  fontSize: "xs",
  color: "neutral.s80",
  fontVariantNumeric: "tabular-nums",
});

const AxisControl = ({
  axis,
  selected,
  onSelect,
}: {
  axis: ExperimentParameterAxis;
  selected: SweepAxisSelection;
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
        aria-label={`${axis.identifier} selection mode`}
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
          min={0}
          max={axis.stepCount}
          step={1}
          value={selected.from}
          aria-label={axis.identifier}
          onChange={commitPoint}
        />
      ) : (
        <RangeSlider
          className={sliderStyle}
          min={0}
          max={axis.stepCount}
          step={1}
          value={[selected.from, selected.to]}
          aria-label={axis.identifier}
          onChange={commitRange}
        />
      )}
      <span className={readoutStyle}>
        {isPoint
          ? formatAxisValue(axisValueAt(axis, selected.from))
          : `${formatAxisValue(axisValueAt(axis, selected.from))} – ${formatAxisValue(
              axisValueAt(axis, selected.to),
            )}`}
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
      {status.computing ? (
        <>
          <LoadingSpinner size="xs" />
          <span>
            {status.runsSampled} of {status.runTarget ?? status.runCount} runs —{" "}
            {activity}
          </span>
        </>
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
}: {
  axes: readonly ExperimentParameterAxis[];
  selection: SweepSelection;
  status: SweepNavigatorStatus;
  onSelectionChange: (selection: SweepSelection) => void;
}) => {
  return (
    <div className={navigatorStyle}>
      {axes.map((axis) => (
        <div className={rowStyle} key={axis.identifier}>
          <span className={nameStyle} title={axis.identifier}>
            {axis.identifier}
          </span>
          <AxisControl
            axis={axis}
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
