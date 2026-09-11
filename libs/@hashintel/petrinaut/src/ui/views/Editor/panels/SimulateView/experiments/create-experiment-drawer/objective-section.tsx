/**
 * The Create Experiment drawer's Objective section: the metric the study
 * optimizes, its direction and the number of steps, in one fixed-height row
 * of labelled cells, over a reserved line that describes the search or names
 * the budget the optimizer would refuse. Every value lives in the draft the
 * drawer owns; the section only edits it.
 */
import {
  NumberInput,
  SegmentedControl,
  Select,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { PETRINAUT_OPTIMIZATION_MAX_TRIALS } from "@hashintel/petrinaut-core/optimization";

import { Section } from "../../../../../../components/section";
import { SWEEP_OPTIMIZATION_RUNS_PER_STEP } from "../sweep-optimizer";
import { fieldStyle, gridStyle, labelStyle } from "./form-field-styles";
import {
  describeSweepObjective,
  SWEEP_OPTIMIZATION_DEFAULT_STEPS,
  type SweepObjectiveDraft,
} from "./sweep-objective";

import type { PetrinautOptimizationDirection } from "@hashintel/petrinaut-core/optimization";

// Always mounted at one height: the description gives way to the error and
// back without moving the section below.
const helperStyle = css({
  fontSize: "xs",
  lineHeight: "[16px]",
  minHeight: "[16px]",
  color: "neutral.s80",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  "&[data-tone='error']": { color: "red.s100" },
});

const SECTION_TOOLTIP =
  "What the optimizer searches the swept intervals for: one experiment metric, pushed up or down, over this many steps. Each step computes eight runs at one point of the sweep before the optimizer reads the metric there; once the search settles the best point refines to the experiment's run budget.";

const directionItems: {
  value: PetrinautOptimizationDirection;
  label: string;
}[] = [
  { value: "maximize", label: "Maximize" },
  { value: "minimize", label: "Minimize" },
];

export const ObjectiveSection = ({
  draft,
  metricId,
  metrics,
  error,
  onChange,
  disabled = false,
}: {
  draft: SweepObjectiveDraft;
  /** The resolved metric id the Select shows; null without a metric draft. */
  metricId: string | null;
  /** The drawer's metric drafts as id/label pairs, in list order. */
  metrics: readonly { id: string; label: string }[];
  /** What the reserved line shows in red; null shows the description. */
  error: string | null;
  onChange: (draft: SweepObjectiveDraft) => void;
  disabled?: boolean;
}) => (
  <Section title="Objective" tooltip={SECTION_TOOLTIP} collapsible defaultOpen>
    <div className={gridStyle}>
      <div className={fieldStyle}>
        <span className={labelStyle}>Metric</span>
        <Select
          size="sm"
          aria-label="Metric to optimize"
          placeholder="Add a metric below"
          items={metrics.map((metric) => ({
            value: metric.id,
            text: metric.label,
          }))}
          value={metricId}
          disabled={disabled || metrics.length === 0}
          onChange={(value) => onChange({ ...draft, metricId: value ?? null })}
        />
      </div>
      <div className={fieldStyle}>
        <span className={labelStyle}>Direction</span>
        <SegmentedControl
          size="sm"
          aria-label="Direction"
          items={directionItems}
          value={draft.direction}
          disabled={disabled}
          onChange={(direction) => onChange({ ...draft, direction })}
        />
      </div>
      <div className={fieldStyle}>
        <span className={labelStyle}>Steps</span>
        <NumberInput
          size="sm"
          aria-label="Optimization steps"
          min={1}
          max={PETRINAUT_OPTIMIZATION_MAX_TRIALS}
          step={1}
          value={draft.steps}
          disabled={disabled}
          onChange={(steps) => onChange({ ...draft, steps })}
        />
      </div>
    </div>
    <span
      className={helperStyle}
      data-tone={error === null ? undefined : "error"}
      title={error ?? undefined}
    >
      {error ??
        describeSweepObjective(
          draft.steps ?? SWEEP_OPTIMIZATION_DEFAULT_STEPS,
          SWEEP_OPTIMIZATION_RUNS_PER_STEP,
        )}
    </span>
  </Section>
);
