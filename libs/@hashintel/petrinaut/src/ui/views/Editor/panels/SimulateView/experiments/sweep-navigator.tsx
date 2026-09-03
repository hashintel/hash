/**
 * The parameter navigator of a sweep experiment: one slider row per swept
 * parameter, plus a refinement status line. Each slider selects a position
 * range on the parameter's quantized interval — the whole interval by
 * default, collapsible to a single point — and moving it redirects compute to
 * the newly selected region; the metrics below re-stream for it, so this
 * strip lives in the section's sticky band and stays visible while the
 * charts scroll.
 *
 * Slider moves commit on release: dragging previews the range locally and
 * `setSweepSelection` fires once, so the session cancels at most one batch
 * per gesture rather than one per pixel.
 */
import { use, useState } from "react";

import { LoadingSpinner, SegmentedControl } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ExperimentsContext } from "../../../../../../react/experiments/context";
import { axisValueAt } from "../../../../../../react/experiments/parameter-grid";
import { RangeSlider } from "./sweep-navigator/range-slider";

import type {
  ExperimentRecord,
  ExperimentSweepState,
} from "../../../../../../react/experiments/context";
import type {
  ExperimentParameterAxis,
  SweepAxisSelection,
} from "../../../../../../react/experiments/parameter-grid";

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

const RefinementStatus = ({
  sweep,
  runCount,
}: {
  sweep: ExperimentSweepState;
  runCount: number;
}) => {
  const isRange = Object.values(sweep.selection).some(
    (range) => range.from !== range.to,
  );
  const activity = isRange
    ? "sampling across the selected ranges"
    : "refining while you stay here";

  return (
    <div className={statusStyle}>
      {sweep.computing ? (
        <>
          <LoadingSpinner size="xs" />
          <span>
            {sweep.runsSampled} of {sweep.runTarget ?? runCount} runs —{" "}
            {activity}
          </span>
        </>
      ) : (
        <span>
          {sweep.runsCompleted} of {runCount} runs
          {sweep.runsCompleted >= runCount ? " — fully sampled" : ""}
        </span>
      )}
    </div>
  );
};

export const SweepNavigator = ({
  experiment,
}: {
  experiment: ExperimentRecord;
}) => {
  const { setSweepSelection } = use(ExperimentsContext);
  const sweep = experiment.sweep;
  if (!sweep) {
    return null;
  }

  return (
    <div className={navigatorStyle}>
      {experiment.parameterAxes.map((axis) => (
        <div className={rowStyle} key={axis.identifier}>
          <span className={nameStyle} title={axis.identifier}>
            {axis.identifier}
          </span>
          <AxisControl
            axis={axis}
            selected={
              sweep.selection[axis.identifier] ?? {
                from: 0,
                to: axis.stepCount,
              }
            }
            onSelect={(range) =>
              setSweepSelection(experiment.id, {
                ...sweep.selection,
                [axis.identifier]: range,
              })
            }
          />
        </div>
      ))}
      <RefinementStatus sweep={sweep} runCount={experiment.runCount} />
    </div>
  );
};
