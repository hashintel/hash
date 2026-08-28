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
 * and the only output is `onSelectionChange`. Slider moves commit on
 * release — dragging previews the range locally and the change fires once,
 * so the owner cancels at most one batch per gesture rather than one per
 * pixel.
 */
import { useState } from "react";

import {
  LoadingSpinner,
  RangeSlider,
  SegmentedControl,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { axisValueAt } from "../../../../../../react/experiments/parameter-grid";

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

const statusStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
  fontSize: "xs",
  color: "neutral.s80",
  fontVariantNumeric: "tabular-nums",
});

function formatAxisValue(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  const abs = Math.abs(value);
  return abs !== 0 && (abs < 0.001 || abs >= 10_000)
    ? value.toExponential(2)
    : String(Number(value.toPrecision(4)));
}

const AxisControl = ({
  axis,
  selected,
  onSelect,
}: {
  axis: ExperimentParameterAxis;
  selected: SweepAxisSelection;
  onSelect: (range: SweepAxisSelection) => void;
}) => {
  /** Range being dragged; null when the slider mirrors the committed state. */
  const [draft, setDraft] = useState<[number, number] | null>(null);

  const isPoint = selected.from === selected.to;
  const shown = draft ?? [selected.from, selected.to];

  const commit = (range: [number, number]) => {
    setDraft(null);
    onSelect({ from: range[0], to: range[1] });
  };

  /** In point mode both thumbs coincide; the moved end is the new point. */
  const pointAt = (range: [number, number]): number =>
    range[0] !== selected.from ? range[0] : range[1];

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
      <RangeSlider
        min={0}
        max={axis.stepCount}
        step={1}
        value={isPoint && draft === null ? [shown[0], shown[0]] : shown}
        aria-label={axis.identifier}
        onChange={(range) => {
          setDraft(isPoint ? [pointAt(range), pointAt(range)] : range);
        }}
        onChangeEnd={(range) => {
          commit(isPoint ? [pointAt(range), pointAt(range)] : range);
        }}
      />
      <span className={readoutStyle}>
        {shown[0] === shown[1]
          ? formatAxisValue(axisValueAt(axis, shown[0]))
          : `${formatAxisValue(axisValueAt(axis, shown[0]))} – ${formatAxisValue(
              axisValueAt(axis, shown[1]),
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
