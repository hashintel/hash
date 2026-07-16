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

const trialHintStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
});

const bestParametersStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "2",
});

const bestParameterStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "3",
  padding: "2",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
  fontSize: "sm",
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

const trialColumns = [
  {
    id: "trial",
    header: "Trial",
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
    id: "best",
    header: "Best so far",
    width: 120,
    render: (trial) =>
      trial.best === null ? "—" : formatNumber(trial.best.objective),
  },
  {
    id: "state",
    header: "State",
    width: 100,
    render: (trial) =>
      trial.state.charAt(0).toUpperCase() + trial.state.slice(1),
  },
] satisfies readonly TableColumn<OptimizationRecord["trials"][number]>[];

const OptimizationSummary = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) => {
  const finishedTrials =
    optimization.completedTrials +
    optimization.prunedTrials +
    optimization.failedTrials;
  const progressPercent =
    optimization.requestedTrials > 0
      ? Math.min(100, (finishedTrials / optimization.requestedTrials) * 100)
      : 0;
  const scenario = optimization.input.model.definition.scenarios.find(
    (candidate) => candidate.id === optimization.input.scenario.id,
  );
  const metric = optimization.input.model.definition.metrics.find(
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
          <span className={statLabelStyle}>Trials</span>
          <span className={statValueStyle}>
            {finishedTrials} / {optimization.requestedTrials}
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
  const displayedTrials = optimization.trials.slice(-200).reverse();

  return (
    <Drawer
      size="xl"
      showBackdrop={false}
      onClose={onClose}
      swapKey="optimization"
    >
      <Drawer.Header
        title={optimization.input.name}
        description="Optuna optimization progress and results"
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
                      <strong>{identifier}</strong>
                      <span>{formatScalar(value)}</span>
                    </div>
                  ),
                )}
              </div>
            </Section>
          ) : null}
          {optimization.trials.length > 0 ? (
            <Section title="Trials" collapsible defaultOpen>
              {optimization.trials.length > displayedTrials.length ? (
                <span className={trialHintStyle}>
                  Showing the latest {displayedTrials.length} of{" "}
                  {optimization.trials.length} received trials.
                </span>
              ) : null}
              <Table
                columns={trialColumns}
                emptyLabel="No trials completed yet"
                getRowId={(trial) => String(trial.trial)}
                rows={displayedTrials}
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
