/**
 * The parameter navigator of a sweep experiment: one control row per swept
 * parameter, plus a refinement status line. Moving any control redirects
 * compute to the newly selected combination; the metrics below re-stream for
 * it, so this strip lives in the section's sticky band and stays visible
 * while the charts scroll.
 *
 * Axes with few values render every value as a segmented control (one click
 * to jump anywhere); longer axes step through values with prev/next.
 */
import { use } from "react";

import {
  Button,
  LoadingSpinner,
  SegmentedControl,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ExperimentsContext } from "../../../../../../react/experiments/context";

import type {
  ExperimentRecord,
  ExperimentSweepState,
} from "../../../../../../react/experiments/context";
import type { ExperimentParameterAxis } from "../../../../../../react/experiments/parameter-grid";

/** Above this many values, a segmented control becomes a stepper. */
const SEGMENTED_VALUE_LIMIT = 6;

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

const stepperStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
});

const stepperValueStyle = css({
  fontSize: "xs",
  fontVariantNumeric: "tabular-nums",
  color: "neutral.s100",
  minWidth: "[96px]",
  textAlign: "center",
});

const stepperPositionStyle = css({
  fontSize: "[10px]",
  color: "neutral.s80",
  fontVariantNumeric: "tabular-nums",
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
    : String(Number(value.toPrecision(6)));
}

const AxisControl = ({
  axis,
  selectedIndex,
  onSelect,
}: {
  axis: ExperimentParameterAxis;
  selectedIndex: number;
  onSelect: (index: number) => void;
}) => {
  if (axis.values.length <= SEGMENTED_VALUE_LIMIT) {
    return (
      <SegmentedControl
        size="xs"
        aria-label={axis.identifier}
        items={axis.values.map((value, index) => ({
          value: String(index),
          label: formatAxisValue(value),
        }))}
        value={String(selectedIndex)}
        onChange={(next) => onSelect(Number(next))}
      />
    );
  }

  return (
    <div className={stepperStyle}>
      <Button
        size="xs"
        variant="ghost"
        tone="neutral"
        iconName="chevronLeft"
        aria-label={`Previous ${axis.identifier} value`}
        disabled={selectedIndex <= 0}
        onClick={() => onSelect(selectedIndex - 1)}
      />
      <span className={stepperValueStyle}>
        {formatAxisValue(axis.values[selectedIndex] ?? 0)}
      </span>
      <Button
        size="xs"
        variant="ghost"
        tone="neutral"
        iconName="chevronRight"
        aria-label={`Next ${axis.identifier} value`}
        disabled={selectedIndex >= axis.values.length - 1}
        onClick={() => onSelect(selectedIndex + 1)}
      />
      <span className={stepperPositionStyle}>
        {selectedIndex + 1}/{axis.values.length}
      </span>
    </div>
  );
};

const RefinementStatus = ({
  sweep,
  runCount,
}: {
  sweep: ExperimentSweepState;
  runCount: number;
}) => (
  <div className={statusStyle}>
    {sweep.computing ? (
      <>
        <LoadingSpinner size="xs" />
        <span>
          {sweep.runsSampled} of {sweep.runTarget ?? runCount} runs — refining
          while you stay here
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
            selectedIndex={sweep.selection[axis.identifier] ?? 0}
            onSelect={(index) =>
              setSweepSelection(experiment.id, {
                ...sweep.selection,
                [axis.identifier]: index,
              })
            }
          />
        </div>
      ))}
      <RefinementStatus sweep={sweep} runCount={experiment.runCount} />
    </div>
  );
};
