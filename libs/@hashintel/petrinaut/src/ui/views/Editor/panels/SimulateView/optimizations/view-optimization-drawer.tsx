import { use } from "react";

import { Button, Drawer, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  isOptimizationActive,
  type OptimizationRecord,
  OptimizationsContext,
} from "../../../../../../react/optimizations/context";
import { Section, SectionList } from "../../../../../components/section";
import { Table, type TableColumn } from "../../../../../components/table";

const summaryGridStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "3",
});

const statStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  minWidth: "[0]",
});

const statLabelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s80",
});

const statValueStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const progressBarStyle = css({
  height: "[6px]",
  width: "full",
  backgroundColor: "neutral.s30",
  borderRadius: "full",
  overflow: "hidden",
});

const progressFillStyle = css({
  height: "full",
  backgroundColor: "neutral.s120",
});

const errorStyle = css({
  fontSize: "sm",
  color: "red.s100",
  whiteSpace: "pre-wrap",
});

const stepHintStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
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

const bestParametersStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
  gap: "2",
});

const bestParameterStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  minWidth: "[0]",
  paddingX: "2.5",
  paddingY: "1.5",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  backgroundColor: "neutral.s05",
});

const bestParameterNameStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  fontFamily: "mono",
  color: "neutral.s120",
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const bestParameterValueStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toPrecision(6);
}

function formatScalar(value: number | boolean): string {
  return typeof value === "boolean" ? String(value) : formatNumber(value);
}

function formatStatus(status: OptimizationRecord["status"]): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

type StepState = OptimizationRecord["trials"][number]["state"];

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

const stepColumns = [
  {
    id: "trial",
    header: "Step",
    width: 70,
    render: (trial) => trial.trial + 1,
  },
  {
    id: "parameters",
    header: "Parameters",
    minWidth: 260,
    flex: "1 1 260px",
    tone: "subtle",
    render: (trial) =>
      Object.entries(trial.parameters)
        .map(([identifier, value]) => `${identifier}=${formatScalar(value)}`)
        .join(", "),
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
] satisfies readonly TableColumn<OptimizationRecord["trials"][number]>[];

const OptimizationSummary = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) => {
  const finishedSteps =
    optimization.completedTrials +
    optimization.prunedTrials +
    optimization.failedTrials;
  const progressPercent =
    optimization.requestedTrials > 0
      ? Math.min(100, (finishedSteps / optimization.requestedTrials) * 100)
      : 0;
  const scenario = optimization.input.model.definition.scenarios?.find(
    (candidate) => candidate.id === optimization.input.scenario.id,
  );
  const metric = optimization.input.model.definition.metrics?.find(
    (candidate) => candidate.id === optimization.input.objective.metricId,
  );

  return (
    <>
      <div className={summaryGridStyle}>
        <div className={statStyle}>
          <span className={statLabelStyle}>Status</span>
          <span className={statValueStyle}>
            {formatStatus(optimization.status)}
          </span>
        </div>
        <div className={statStyle}>
          <span className={statLabelStyle}>Scenario</span>
          <span className={statValueStyle}>
            {scenario?.name ?? optimization.input.scenario.id}
          </span>
        </div>
        <div className={statStyle}>
          <span className={statLabelStyle}>Objective</span>
          <span className={statValueStyle}>
            {optimization.input.objective.direction === "maximize"
              ? "Maximize"
              : "Minimize"}{" "}
            {metric?.name ?? optimization.input.objective.metricId}
          </span>
        </div>
        <div className={statStyle}>
          <span className={statLabelStyle}>Steps</span>
          <span className={statValueStyle}>
            {finishedSteps} / {optimization.requestedTrials}
          </span>
        </div>
        <div className={statStyle}>
          <span className={statLabelStyle}>Best value</span>
          <span className={statValueStyle}>
            {optimization.best
              ? formatNumber(optimization.best.objective)
              : "—"}
          </span>
        </div>
        <div className={statStyle}>
          <span className={statLabelStyle}>Failed / pruned</span>
          <span className={statValueStyle}>
            {optimization.failedTrials} / {optimization.prunedTrials}
          </span>
        </div>
      </div>
      <div className={progressBarStyle}>
        <div
          className={progressFillStyle}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      {optimization.error ? (
        <span className={errorStyle}>{optimization.error}</span>
      ) : null}
    </>
  );
};

export const ViewOptimizationDrawer = ({
  open,
  onClose,
  optimization,
}: {
  open: boolean;
  onClose: () => void;
  optimization: OptimizationRecord | undefined;
}) => {
  const { cancelOptimization, removeOptimization } = use(OptimizationsContext);

  if (!open || !optimization) {
    return null;
  }

  const active = isOptimizationActive(optimization);
  const displayedSteps = optimization.trials.slice(-200).reverse();

  return (
    <Drawer
      size="xl"
      showBackdrop={false}
      onClose={onClose}
      swapKey="optimization"
    >
      <Drawer.Header
        title={optimization.input.name}
        description="Optimization progress and results"
      />
      <Drawer.Body className={css({ paddingTop: "[0]" })}>
        <SectionList>
          <Section title="Summary" collapsible defaultOpen>
            <OptimizationSummary optimization={optimization} />
          </Section>
          {optimization.best ? (
            <Section title="Best parameters" collapsible defaultOpen>
              <div className={bestParametersStyle}>
                {Object.entries(optimization.best.parameters).map(
                  ([identifier, value]) => (
                    <div key={identifier} className={bestParameterStyle}>
                      <span className={bestParameterNameStyle}>
                        {identifier}
                      </span>
                      <span className={bestParameterValueStyle}>
                        {formatScalar(value)}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </Section>
          ) : null}
          {optimization.trials.length > 0 ? (
            <Section title="Steps" collapsible defaultOpen>
              {optimization.trials.length > displayedSteps.length ? (
                <span className={stepHintStyle}>
                  Showing the latest {displayedSteps.length} of{" "}
                  {optimization.trials.length} received steps.
                </span>
              ) : null}
              <Table
                columns={stepColumns}
                emptyLabel="No steps completed yet"
                getRowId={(trial) => String(trial.trial)}
                rows={displayedSteps}
              />
            </Section>
          ) : null}
        </SectionList>
      </Drawer.Body>
      <Drawer.Footer
        actions={
          <>
            {!active ? (
              <Button
                variant="subtle"
                tone="error"
                size="sm"
                prefix={<Icon name="trash" size="sm" />}
                onClick={() => {
                  removeOptimization(optimization.id);
                  onClose();
                }}
              >
                Remove
              </Button>
            ) : null}
            {active ? (
              <Button
                variant="subtle"
                tone="neutral"
                size="sm"
                prefix={<Icon name="stop" size="sm" />}
                onClick={() => cancelOptimization(optimization.id)}
              >
                Cancel
              </Button>
            ) : null}
            <Button variant="solid" tone="neutral" size="sm" onClick={onClose}>
              Close
            </Button>
          </>
        }
      />
    </Drawer>
  );
};
