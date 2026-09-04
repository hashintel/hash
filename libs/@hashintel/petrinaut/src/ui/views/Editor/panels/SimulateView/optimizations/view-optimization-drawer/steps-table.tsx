/**
 * The study's steps, newest first: number, parameters, objective and a state
 * mark. The best step carries a star and the table's selected-row tint. A
 * long study shows its latest steps only, so the table stays light.
 */
import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { Table, type TableColumn } from "../../../../../../components/table";
import { formatNumber, formatParameters } from "./shared/format-value";

import type { OptimizationRecord } from "../../../../../../../react/optimizations/context";

type Step = OptimizationRecord["trials"][number];
type StepState = Step["state"];

const stepHintStyle = css({
  fontSize: "xs",
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
  "& svg": {
    width: "[9px]",
    height: "[9px]",
  },
});

const stepStatePresentation = {
  complete: { label: "Complete", icon: "check" },
  pruned: { label: "Pruned", icon: "filter" },
  failed: { label: "Failed", icon: "close" },
} as const satisfies Record<StepState, { label: string; icon: string }>;

const renderStepState = (state: StepState) => {
  const { label, icon } = stepStatePresentation[state];

  return (
    <span
      className={stepStateStyle}
      data-state={state}
      role="img"
      aria-label={label}
      title={label}
    >
      <Icon name={icon} size="xxs" />
    </span>
  );
};

const stepColumns = (
  bestTrial: number | null,
): readonly TableColumn<Step>[] => [
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
        trial.trial + 1
      ),
  },
  {
    id: "parameters",
    header: "Parameters",
    minWidth: 260,
    flex: "1 1 260px",
    tone: "subtle",
    render: (trial) => formatParameters(trial.parameters),
  },
  {
    id: "objective",
    header: "Objective",
    width: 120,
    render: (trial) =>
      trial.objective === null ? "—" : formatNumber(trial.objective),
  },
  {
    id: "state",
    header: null,
    width: 18,
    render: (trial) => renderStepState(trial.state),
  },
];

/** The latest steps only: the table stays light on a long study. */
const DISPLAYED_STEPS = 200;

/** The note above a truncated table; null while every step is shown. */
export const describeDisplayedSteps = (
  optimization: Pick<OptimizationRecord, "trials">,
): string | null =>
  optimization.trials.length > DISPLAYED_STEPS
    ? `Showing the latest ${DISPLAYED_STEPS} of ${optimization.trials.length} received steps.`
    : null;

export const StepsTable = ({
  optimization,
  bestTrial,
  className,
}: {
  optimization: OptimizationRecord;
  /** The step to star; null marks none. */
  bestTrial: number | null;
  className: string;
}) => {
  const displayedSteps = optimization.trials.slice(-DISPLAYED_STEPS).reverse();
  const hint = describeDisplayedSteps(optimization);

  return (
    <>
      {hint === null ? null : <span className={stepHintStyle}>{hint}</span>}
      <div className={className}>
        <Table
          columns={stepColumns(bestTrial)}
          emptyLabel="No steps completed yet"
          getRowId={(trial) => String(trial.trial)}
          rows={displayedSteps}
          selectedRowId={bestTrial === null ? undefined : String(bestTrial)}
        />
      </div>
    </>
  );
};
