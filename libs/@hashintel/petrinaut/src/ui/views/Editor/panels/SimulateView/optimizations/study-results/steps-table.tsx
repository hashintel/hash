import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

/**
 * The study's steps, newest first: number, parameters, objective, the runs
 * passed when the study has constraints, and a state mark. The best step
 * carries a star and the table's selected-row tint; a step whose draw broke a
 * parameter constraint is greyed, its mark naming the constraint. A long
 * study shows its latest steps only, so the table stays light.
 */
import {
  bindingStepRate,
  constraintAlpha,
  constraintNameIn,
  formatRate,
} from "../../../../../../../react/optimizations/constraint-rates";
import { Table, type TableColumn } from "../../../../../../components/table";
import { formatNumber, formatParameters } from "../../shared/format-value";
import { INFEASIBLE_COLOR } from "./shared/infeasible-color";

import type { OptimizationRecord } from "../../../../../../../react/optimizations/context";

type Step = OptimizationRecord["trials"][number];
type StepState = Step["state"];

const stepHintStyle = css({
  display: "block",
  height: "[16px]",
  fontSize: "xs",
  lineHeight: "[16px]",
  color: "neutral.s80",
});

const stepNumberStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  "& svg": {
    width: "[10px]",
    height: "[10px]",
  },
});

const stepStateStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[18px]",
  height: "[18px]",
  borderRadius: "full",
  color: "white",
  flexShrink: "0",
  "&[data-state='complete']": {
    backgroundColor: "green.s90",
  },
  "&[data-state='pruned']": {
    backgroundColor: "orange.s80",
  },
  "&[data-state='failed']": {
    backgroundColor: "red.s90",
  },
  "&[data-state='infeasible']": {
    backgroundColor: `[${INFEASIBLE_COLOR}]`,
  },
  "& svg": {
    width: "[9px]",
    height: "[9px]",
  },
});

// The table's own cell text, in the grey of an infeasible draw.
const infeasibleTextStyle = css({
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[18px]",
  color: "neutral.s70",
});

const stepStatePresentation = {
  complete: { label: "Complete", icon: "check" },
  pruned: { label: "Pruned", icon: "filter" },
  failed: { label: "Failed", icon: "close" },
} as const satisfies Record<StepState, { label: string; icon: string }>;

/** The parameter constraint a step's draw broke, named, or null for a feasible draw. */
const infeasibleConstraint = (
  input: OptimizationRecord["input"],
  trial: Step,
): string | null => {
  const constraintId = trial.constraints?.infeasible;
  return constraintId === undefined
    ? null
    : constraintNameIn(input, constraintId);
};

const renderStepState = (state: StepState, infeasible: string | null) => {
  const { label, icon } =
    infeasible === null
      ? stepStatePresentation[state]
      : { label: `Infeasible: ${infeasible}`, icon: "filter" as const };

  return (
    <span
      className={stepStateStyle}
      data-state={infeasible === null ? state : "infeasible"}
      role="img"
      aria-label={label}
      title={label}
    >
      <Icon name={icon} size="xxs" />
    </span>
  );
};

/** A cell's text: the table styles a plain string; an infeasible draw's row is greyed. */
const cellText = (text: string, infeasible: boolean) =>
  infeasible ? <span className={infeasibleTextStyle}>{text}</span> : text;

const stepColumns = (
  input: OptimizationRecord["input"],
  bestTrial: number | null,
): readonly TableColumn<Step>[] => {
  const constrained = (input.constraints ?? []).length > 0;
  const alpha = constraintAlpha(input);
  const isInfeasible = (trial: Step) =>
    infeasibleConstraint(input, trial) !== null;
  return [
    {
      id: "trial",
      header: "Step",
      width: 70,
      render: (trial) =>
        trial.trial === bestTrial ? (
          <span className={stepNumberStyle} title="Best step">
            <Icon name="star" size="xxs" />
            {trial.trial + 1}
          </span>
        ) : (
          cellText(String(trial.trial + 1), isInfeasible(trial))
        ),
    },
    {
      id: "parameters",
      header: "Parameters",
      minWidth: 260,
      flex: "1 1 260px",
      tone: "subtle",
      render: (trial) =>
        cellText(formatParameters(trial.parameters), isInfeasible(trial)),
    },
    {
      id: "objective",
      header: "Objective",
      width: 120,
      render: (trial) =>
        cellText(
          trial.objective === null ? "—" : formatNumber(trial.objective),
          isInfeasible(trial),
        ),
    },
    ...(constrained
      ? [
          {
            id: "runsPassed",
            header: "Runs passed",
            width: 120,
            render: (trial: Step) => {
              const binding = bindingStepRate(trial, alpha);
              return cellText(
                binding === null
                  ? "—"
                  : formatRate(binding.runsPassed, binding.runsTotal),
                isInfeasible(trial),
              );
            },
          } satisfies TableColumn<Step>,
        ]
      : []),
    {
      id: "state",
      header: null,
      width: 18,
      render: (trial) =>
        renderStepState(trial.state, infeasibleConstraint(input, trial)),
    },
  ];
};

/** The latest steps only: the table stays light on a long study. */
const DISPLAYED_STEPS = 200;

export const StepsTable = ({
  optimization,
  bestTrial,
  className,
  height,
}: {
  optimization: OptimizationRecord;
  /** The step to star; null marks none. */
  bestTrial: number | null;
  className: string;
  /** The table box's fixed height in pixels; the steps scroll inside it. */
  height: number;
}) => {
  const displayedSteps = optimization.trials.slice(-DISPLAYED_STEPS).reverse();

  return (
    <>
      {/* The hint's row is reserved, so the 201st step moves nothing. */}
      <span className={stepHintStyle} data-steps-hint>
        {optimization.trials.length > DISPLAYED_STEPS
          ? `Showing the latest ${DISPLAYED_STEPS} of ${optimization.trials.length} received steps.`
          : ""}
      </span>
      <div className={className} style={{ height }} data-steps-table>
        <Table
          columns={stepColumns(optimization.input, bestTrial)}
          emptyLabel="No steps completed yet"
          getRowId={(trial) => String(trial.trial)}
          rows={displayedSteps}
          selectedRowId={bestTrial === null ? undefined : String(bestTrial)}
        />
      </div>
    </>
  );
};
