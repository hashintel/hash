import { use } from "react";

import { Button, Drawer, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  followedTrial,
  isOptimizationActive,
  type OptimizationNavigation,
  type OptimizationRecord,
  OptimizationsContext,
} from "../../../../../../react/optimizations/context";
import { optimizationBooleanIdentifiers } from "../../../../../../react/optimizations/surface-grid";
import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
import { Section, SectionList } from "../../../../../components/section";
import { Table, type TableColumn } from "../../../../../components/table";
import {
  ComputeActivity,
  type ComputeActivityBar,
  type ComputeActivityBatch,
} from "../shared/compute-activity";
import { ComputeBackendBadge } from "../shared/compute-backend-badge";
import { describeOptimizationStatus } from "./optimization-status";
import {
  NavigatedOptimizationSurface,
  OptimizationSurface,
} from "./optimization-surface";
import {
  ContinueControl,
  remainingOptimizationSteps,
} from "./view-optimization-drawer/continue-control";
import { OptimizationMetrics } from "./view-optimization-drawer/optimization-metrics";
import { OptimizationNavigator } from "./view-optimization-drawer/optimization-navigator";

const summaryStyle = css({
  marginTop: "-1",
  marginBottom: "3",
});

const summaryGridStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "3",
});

const statStyle = css({
  display: "flex",
  flexDirection: "column",
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

const activityStyle = css({
  marginTop: "4",
});

const errorStyle = css({
  fontSize: "sm",
  color: "red.s100",
  whiteSpace: "pre-wrap",
});

const noteStyle = css({
  display: "block",
  marginTop: "2",
  fontSize: "xs",
  color: "neutral.s80",
});

const stepHintStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
});

// The drawer body is a column: the summary, the navigator and the surface
// hold still at the top, and one region below them scrolls.
const drawerBodyStyle = css({
  paddingTop: "[0]",
  display: "flex",
  flexDirection: "column",
  // The overlay body scrolls by default; here only the region below may.
  overflow: "hidden",
});

const fixedSectionStyle = css({
  flexShrink: "0",
});

const stepsScrollStyle = css({
  flex: "[1]",
  minHeight: "[160px]",
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

// A connected study's chart and steps share this region; the section
// headers inside it pin themselves as it scrolls.
const scrollRegionStyle = css({
  flex: "[1]",
  minHeight: "[200px]",
  overflowY: "auto",
  scrollbarWidth: "[thin]",
});

const stepsTableStyle = css({
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
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

const finishedStepCount = (optimization: OptimizationRecord): number =>
  optimization.completedTrials +
  optimization.prunedTrials +
  optimization.failedTrials;

/** The summary's main bar: steps finished over steps requested. */
const stepsBar = (optimization: OptimizationRecord): ComputeActivityBar => {
  const finished = finishedStepCount(optimization);
  return {
    percent:
      optimization.requestedTrials > 0
        ? Math.min(100, (finished / optimization.requestedTrials) * 100)
        : 0,
    label: `Steps · ${finished} / ${optimization.requestedTrials}`,
  };
};

/**
 * The thinner bar beneath: the followed step's runs over the runs each step
 * gets, while a step is being followed.
 */
const followedStepBar = (
  optimization: OptimizationRecord,
): ComputeActivityBar | null => {
  const { selection } = optimization;
  if (selection === null || !selection.computing) {
    return null;
  }
  const trial = followedTrial(selection.key);
  if (trial === null) {
    return null;
  }
  const runsPerStep = optimization.input.execution.seedsPerTrial ?? 1;
  return {
    percent: Math.min(100, (selection.runsCompleted / runsPerStep) * 100),
    label: `Step ${trial + 1} · ${selection.runsCompleted} / ${runsPerStep} runs`,
  };
};

/** The study's batches as the activity list shows them; steps are the priority work. */
const activityBatches = (
  optimization: OptimizationRecord,
): ComputeActivityBatch[] =>
  optimization.activity.map((batch) => ({
    id: batch.id,
    label: batch.label,
    tone: batch.kind === "step" ? "priority" : "background",
    runCount: batch.runCount,
    completedRuns: batch.completedRuns,
  }));

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

/** The latest steps only: the table stays light on a long study. */
const DISPLAYED_STEPS = 200;

const OptimizationSummary = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) => {
  const finishedSteps = finishedStepCount(optimization);
  const scenario = optimization.input.model.definition.scenarios?.find(
    (candidate) => candidate.id === optimization.input.scenario.id,
  );
  const metric = optimization.input.model.definition.metrics?.find(
    (candidate) => candidate.id === optimization.input.objective.metricId,
  );
  const seedsPerTrial = optimization.input.execution.seedsPerTrial ?? 1;

  return (
    <div className={summaryStyle}>
      <div className={summaryGridStyle}>
        <div className={statStyle}>
          <span className={statLabelStyle}>Status</span>
          <span className={statValueStyle}>
            {describeOptimizationStatus(optimization)}
            {optimization.connectionState === "reconnecting"
              ? " (reconnecting…)"
              : ""}
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
            {seedsPerTrial > 1 ? ` · ${seedsPerTrial} runs each` : ""}
            {optimization.parallelism > 1
              ? ` · ${optimization.parallelism} at once`
              : ""}
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
      <div className={activityStyle}>
        <ComputeActivity
          bar={stepsBar(optimization)}
          secondaryBar={followedStepBar(optimization)}
          batches={activityBatches(optimization)}
        />
      </div>
      {optimization.navigation !== null &&
      optimization.computeBackendFallbackReason !== null ? (
        <span className={noteStyle}>
          Ran on the CPU: {optimization.computeBackendFallbackReason}
        </span>
      ) : null}
      {optimization.error ? (
        <span className={errorStyle}>{optimization.error}</span>
      ) : null}
    </div>
  );
};

const SummarySection = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) => (
  <Section
    title="Summary"
    collapsible
    defaultOpen
    className={fixedSectionStyle}
    // Only a connected study computes here; a remote study's badge would
    // name this machine's backend for compute that ran on a service.
    renderHeaderAction={
      optimization.navigation !== null
        ? () => <ComputeBackendBadge backend={optimization} />
        : undefined
    }
  >
    <OptimizationSummary optimization={optimization} />
  </Section>
);

const BestParametersSection = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) =>
  optimization.best ? (
    <Section
      title="Best parameters"
      collapsible
      defaultOpen
      className={fixedSectionStyle}
    >
      <div className={bestParametersStyle}>
        {Object.entries(optimization.best.parameters).map(
          ([identifier, value]) => (
            <div key={identifier} className={bestParameterStyle}>
              <span className={bestParameterNameStyle}>{identifier}</span>
              <span className={bestParameterValueStyle}>
                {formatScalar(value)}
              </span>
            </div>
          ),
        )}
      </div>
    </Section>
  ) : null;

const StepsTable = ({
  optimization,
  className,
}: {
  optimization: OptimizationRecord;
  className: string;
}) => {
  const displayedSteps = optimization.trials.slice(-DISPLAYED_STEPS).reverse();

  return (
    <>
      {optimization.trials.length > displayedSteps.length ? (
        <span className={stepHintStyle}>
          Showing the latest {displayedSteps.length} of{" "}
          {optimization.trials.length} received steps.
        </span>
      ) : null}
      <div className={className}>
        <Table
          columns={stepColumns}
          emptyLabel="No steps completed yet"
          getRowId={(trial) => String(trial.trial)}
          rows={displayedSteps}
        />
      </div>
    </>
  );
};

/** A study run elsewhere: results only, plus the experimental surface. */
const RemoteStudySections = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) => {
  const { enableOptimizationSurface } = use(UserSettingsContext);
  const surfaceEligible =
    enableOptimizationSurface && optimization.axes.length >= 2;

  return (
    <>
      <SummarySection optimization={optimization} />
      <BestParametersSection optimization={optimization} />
      {surfaceEligible ? (
        <Section
          title="Surface"
          tooltip="The objective over two optimized parameters, computed locally on this machine — the study's own trials appear as rings. Move the sliders or click the plot to recompute elsewhere."
          collapsible
          defaultOpen
          className={fixedSectionStyle}
        >
          <OptimizationSurface
            key={optimization.id}
            optimization={optimization}
          />
        </Section>
      ) : null}
      {optimization.trials.length > 0 ? (
        <Section title="Steps" fillHeight>
          <StepsTable
            optimization={optimization}
            className={stepsScrollStyle}
          />
        </Section>
      ) : null}
    </>
  );
};

/**
 * A study evaluated in this browser: its navigation drives the surface and
 * the objective's chart, following each step while it runs.
 */
const ConnectedStudySections = ({
  optimization,
  navigation,
}: {
  optimization: OptimizationRecord;
  navigation: OptimizationNavigation;
}) => {
  const { setOptimizationNavigation } = use(OptimizationsContext);
  const onNavigationChange = (patch: Partial<OptimizationNavigation>) =>
    setOptimizationNavigation(optimization.id, patch);

  return (
    <>
      <SummarySection optimization={optimization} />
      <BestParametersSection optimization={optimization} />
      <Section
        title="Parameters"
        tooltip="The chart below shows the objective at this point. While the study runs and Follow steps is on, the point follows each step as it is evaluated and the controls only show it; turn Follow steps off, or wait for the study to finish, to move them and look elsewhere."
        className={fixedSectionStyle}
        // Not collapsible: the navigator stays usable while the chart
        // below streams.
        renderStickyBand={() => (
          <OptimizationNavigator
            axes={optimization.axes}
            booleanParameters={optimizationBooleanIdentifiers(
              optimization.input,
            )}
            navigation={navigation}
            selection={optimization.selection}
            running={isOptimizationActive(optimization)}
            onNavigationChange={onNavigationChange}
          />
        )}
      >
        {null}
      </Section>
      {optimization.axes.length >= 2 ? (
        <Section
          title="Surface"
          tooltip="The objective over two optimized parameters, drawn from the study's own steps: each step is a dot, the best emphasized, pruned steps hollow, and the field is interpolated between them. The ringed dot is the step being evaluated, filling in as it runs; once the study is over, or Follow steps is off, click or drag the plot to refine a point."
          collapsible
          defaultOpen
          className={fixedSectionStyle}
        >
          <NavigatedOptimizationSurface
            key={optimization.id}
            optimization={optimization}
            navigation={navigation}
            selection={optimization.selection}
            onNavigationChange={onNavigationChange}
          />
        </Section>
      ) : null}
      <div className={scrollRegionStyle}>
        <SectionList>
          <Section title="Metrics" collapsible defaultOpen>
            {/* Keyed so faded previous pictures and size choices never leak
                from one study into another when the drawer swaps records. */}
            <OptimizationMetrics
              key={optimization.id}
              optimization={optimization}
              selection={optimization.selection}
            />
          </Section>
          {optimization.trials.length > 0 ? (
            <Section title="Steps" collapsible defaultOpen>
              <StepsTable
                optimization={optimization}
                className={stepsTableStyle}
              />
            </Section>
          ) : null}
        </SectionList>
      </div>
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
  const {
    cancelOptimization,
    removeOptimization,
    extendOptimization,
    retryOptimization,
  } = use(OptimizationsContext);

  if (!open || !optimization) {
    return null;
  }

  const active = isOptimizationActive(optimization);
  const connected = optimization.navigation !== null;

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
      <Drawer.Body className={drawerBodyStyle}>
        <SectionList>
          {optimization.navigation ? (
            <ConnectedStudySections
              optimization={optimization}
              navigation={optimization.navigation}
            />
          ) : (
            <RemoteStudySections optimization={optimization} />
          )}
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
                {connected ? "Stop" : "Cancel"}
              </Button>
            ) : null}
            {optimization.resumable ? (
              <ContinueControl
                // Reset with the segment, so the count starts fresh after
                // each continuation.
                key={optimization.requestedTrials}
                defaultSteps={optimization.input.study.trials}
                remainingSteps={remainingOptimizationSteps(
                  optimization.requestedTrials,
                )}
                onContinue={(steps) =>
                  extendOptimization(optimization.id, steps).catch(
                    () => undefined,
                  )
                }
              />
            ) : null}
            {optimization.status === "error" ? (
              <Button
                variant="subtle"
                tone="neutral"
                size="sm"
                prefix={<Icon name="rotate" size="sm" />}
                /**
                 * Retrying selects the new run, so the drawer re-points at it
                 * and shows the fresh attempt — matching what creating a run
                 * does. Closing here would undo that selection and leave the
                 * retried run progressing behind an empty table.
                 */
                onClick={() => {
                  void retryOptimization(optimization.id);
                }}
              >
                Retry
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
