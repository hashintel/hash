/**
 * The study's steps, newest first, in a fixed box beneath the columns: the
 * steps scroll inside it, the header row pinned. A step shows its number,
 * parameters, objective, the runs passed when the study has constraints, and
 * a state mark. The best step carries a star and the table's selected-row
 * tint; a step whose draw broke a parameter constraint is greyed, its mark
 * naming the constraint. A long study shows its latest steps only, so the
 * table stays light.
 */
import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  bindingStepRate,
  constraintAlpha,
  constraintNameIn,
  formatRate,
} from "../../../../../../../react/optimizations/constraint-rates";
import { Table, type TableColumn } from "../../../../../../components/table";
import { formatNumber, formatParameters } from "../../shared/format-value";
import { INFEASIBLE_COLOR } from "../../shared/infeasible-color";

import type { OptimizationRecord } from "../../../../../../../react/optimizations/context";

type Step = OptimizationRecord["trials"][number];

/** The latest steps only: the table stays light on a long study. */
const DISPLAYED_STEPS = 200;
/** The table box's fixed height in pixels; the steps scroll inside it. */
const STEPS_TABLE_HEIGHT = 320;

const stepsStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

const scrollStyle = css({
  overflowY: "auto",
  scrollbarWidth: "[thin]",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
  // Pin the table's header while the steps scroll beneath it. The sticky
  // element must be the header's rowgroup: a sticky row could only move
  // within that rowgroup, which is exactly as tall as the row itself.
  "& [role='table'] > [role='rowgroup']:first-child": {
    position: "sticky",
    top: "[0]",
    zIndex: "[1]",
  },
});

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
} as const satisfies Record<Step["state"], { label: string; icon: string }>;

const isInfeasible = (step: Step): boolean =>
  step.constraints?.infeasible !== undefined;

const StepStateMark = ({
  step,
  input,
}: {
  step: Step;
  input: OptimizationRecord["input"];
}) => {
  const infeasible = step.constraints?.infeasible;
  const { label, icon } =
    infeasible === undefined
      ? stepStatePresentation[step.state]
      : {
          label: `Infeasible: ${constraintNameIn(input, infeasible)}`,
          icon: "filter" as const,
        };

  return (
    <span
      className={stepStateStyle}
      data-state={infeasible === undefined ? step.state : "infeasible"}
      role="img"
      aria-label={label}
      title={label}
    >
      <Icon name={icon} size="xxs" />
    </span>
  );
};

/** A cell's text: the table styles a plain string; an infeasible draw's row is greyed. */
const cellText = (text: string, step: Step) =>
  isInfeasible(step) ? (
    <span className={infeasibleTextStyle}>{text}</span>
  ) : (
    text
  );

const stepColumns = (
  input: OptimizationRecord["input"],
  bestTrial: number | undefined,
): readonly TableColumn<Step>[] => {
  const constrained = (input.constraints ?? []).length > 0;
  const alpha = constraintAlpha(input);
  return [
    {
      id: "trial",
      header: "Step",
      width: 70,
      render: (step) =>
        step.trial === bestTrial ? (
          <span className={stepNumberStyle} title="Best step">
            <Icon name="star" size="xxs" />
            {step.trial + 1}
          </span>
        ) : (
          cellText(String(step.trial + 1), step)
        ),
    },
    {
      id: "parameters",
      header: "Parameters",
      minWidth: 260,
      flex: "1 1 260px",
      tone: "subtle",
      render: (step) => cellText(formatParameters(step.parameters), step),
    },
    {
      id: "objective",
      header: "Objective",
      width: 120,
      render: (step) =>
        cellText(
          step.objective === null ? "—" : formatNumber(step.objective),
          step,
        ),
    },
    ...(constrained
      ? [
          {
            id: "runsPassed",
            header: "Runs passed",
            width: 120,
            render: (step: Step) => {
              const binding = bindingStepRate(step, alpha);
              return cellText(
                binding === null
                  ? "—"
                  : formatRate(binding.runsPassed, binding.runsTotal),
                step,
              );
            },
          } satisfies TableColumn<Step>,
        ]
      : []),
    {
      id: "state",
      header: null,
      width: 18,
      render: (step) => <StepStateMark step={step} input={input} />,
    },
  ];
};

export const StudySteps = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) => {
  const { input, trials } = optimization;
  const bestTrial = optimization.best?.trial;

  return (
    <div className={stepsStyle} data-study-steps>
      {/* The hint's row is reserved, so the 201st step moves nothing. */}
      <span className={stepHintStyle} data-steps-hint>
        {trials.length > DISPLAYED_STEPS
          ? `Showing the latest ${DISPLAYED_STEPS} of ${trials.length} received steps.`
          : ""}
      </span>
      <div
        className={scrollStyle}
        style={{ height: STEPS_TABLE_HEIGHT }}
        data-steps-table
      >
        <Table
          columns={stepColumns(input, bestTrial)}
          emptyLabel="No steps completed yet"
          getRowId={(step) => String(step.trial)}
          rows={trials.slice(-DISPLAYED_STEPS).reverse()}
          selectedRowId={
            bestTrial === undefined ? undefined : String(bestTrial)
          }
        />
      </div>
    </div>
  );
};
