import { NumberInput, Radio, SegmentedControl } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { PETRINAUT_OPTIMIZATION_MAX_TRIALS } from "@hashintel/petrinaut-core/optimization";

import { SWEEP_OPTIMIZATION_RUNS_PER_STEP } from "../sweep-optimizer";
import { labelStyle } from "./form-field-styles";
import {
  describeSweepObjective,
  SWEEP_OPTIMIZATION_DEFAULT_STEPS,
} from "./sweep-objective";

import type { PetrinautOptimizationDirection } from "@hashintel/petrinaut-core/optimization";

const objectiveStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: "2",
  padding: "[4px 12px]",
  minHeight: "[34px]",
  borderTopWidth: "[1px]",
  borderTopStyle: "solid",
  borderTopColor: "neutral.bd.subtle",
  backgroundColor: "neutral.s20",
  "&[data-objective=true]": {
    borderTopColor: "purple.s40",
    backgroundColor: "purple.s30",
  },
});

const budgetStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  paddingTop: "2",
});

const stepsStyle = css({
  display: "grid",
  gridTemplateColumns: "[minmax(0, 1fr) 120px]",
  alignItems: "center",
  gap: "3",
});

const helperStyle = css({
  fontSize: "xs",
  lineHeight: "[16px]",
  minHeight: "[16px]",
  color: "neutral.s80",
  "&[data-tone='error']": { color: "red.s100" },
});

const directionItems: {
  value: PetrinautOptimizationDirection;
  label: string;
}[] = [
  { value: "maximize", label: "Maximize" },
  { value: "minimize", label: "Minimize" },
];

export const MetricObjectiveControl = ({
  metricId,
  metricLabel,
  groupName,
  direction,
  onSelect,
  onDirectionChange,
  disabled = false,
}: {
  metricId: string;
  metricLabel: string;
  groupName: string;
  direction: PetrinautOptimizationDirection | null;
  onSelect: () => void;
  onDirectionChange: (direction: PetrinautOptimizationDirection) => void;
  disabled?: boolean;
}) => (
  <div
    className={objectiveStyle}
    data-objective={direction !== null}
    role="group"
    aria-label={`Optimization for ${metricLabel}`}
  >
    <Radio
      size="xs"
      name={groupName}
      htmlValue={metricId}
      label="Use as objective"
      value={direction !== null}
      disabled={disabled}
      onChange={(selected) => {
        if (selected) {
          onSelect();
        }
      }}
    />
    {direction !== null ? (
      <SegmentedControl
        size="xs"
        aria-label="Direction"
        items={directionItems}
        value={direction}
        disabled={disabled}
        onChange={onDirectionChange}
      />
    ) : null}
  </div>
);

export const OptimizationBudget = ({
  steps,
  error,
  onChange,
  disabled = false,
}: {
  steps: number | null;
  error: string | null;
  onChange: (steps: number | null) => void;
  disabled?: boolean;
}) => (
  <div className={budgetStyle}>
    <div className={stepsStyle}>
      <span className={labelStyle}>Optimization steps</span>
      <NumberInput
        size="sm"
        aria-label="Optimization steps"
        min={1}
        max={PETRINAUT_OPTIMIZATION_MAX_TRIALS}
        step={1}
        value={steps}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
    <span
      className={helperStyle}
      data-tone={error === null ? undefined : "error"}
    >
      {error ??
        describeSweepObjective(
          steps ?? SWEEP_OPTIMIZATION_DEFAULT_STEPS,
          SWEEP_OPTIMIZATION_RUNS_PER_STEP,
        )}
    </span>
  </div>
);
