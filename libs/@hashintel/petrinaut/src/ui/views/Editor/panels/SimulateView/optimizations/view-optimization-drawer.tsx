import { use } from "react";

import { Button, Drawer, HelpTooltip, Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import {
  isOptimizationActive,
  type OptimizationNavigation,
  type OptimizationRecord,
  OptimizationsContext,
} from "../../../../../../react/optimizations/context";
import { optimizationBooleanIdentifiers } from "../../../../../../react/optimizations/surface-grid";
import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
import { Section, SectionList } from "../../../../../components/section";
import { ComputeActivity } from "../shared/compute-activity";
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
import {
  OptimizationNavigator,
  OptimizationNavigatorStatus,
} from "./view-optimization-drawer/optimization-navigator";
import {
  formatNumber,
  formatScalar,
} from "./view-optimization-drawer/shared/format-value";
import {
  activityBatches,
  finishedStepCount,
  followedStepBar,
  stepsBar,
} from "./view-optimization-drawer/shared/study-progress";
import { StepsTable } from "./view-optimization-drawer/steps-table";
import { StudySummaryStrip } from "./view-optimization-drawer/study-summary-strip";

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

const remoteStepsHeightStyle = css({
  minHeight: "[160px]",
});

// A connected study's steps get whatever height the panes above leave: two
// rows at a short viewport, a page of them at a tall one. The table's own
// header names the columns, so no section title precedes it.
const connectedStepsStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  flex: "[1]",
  minHeight: "[0]",
  paddingTop: "3",
  paddingBottom: "3",
});

const connectedStepsHeightStyle = css({
  minHeight: "[96px]",
});

// The surface and the objective's chart side by side, each with its own
// control row over a plot of the same height; they stack when the drawer is
// too narrow for two readable plots.
const panesStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
  alignItems: "start",
  gap: "5",
  paddingTop: "2.5",
  paddingBottom: "2",
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

const PARAMETERS_HELP =
  "The chart beside the surface shows the objective at this point. While the study runs and Follow steps is on, the point follows each step as it is evaluated and the controls only show it; turn Follow steps off, or wait for the study to finish, to move them and look elsewhere.";

const SURFACE_HELP =
  "The objective over two optimized parameters, drawn from the study's own steps: each step is a dot, the best emphasized, pruned steps hollow, and the field is interpolated between them. The ringed dot is the step being evaluated, filling in as it runs; once the study is over, or Follow steps is off, click or drag the plot to refine a point.";

/** The header's second line: the scenario and the objective. */
const describeStudy = (optimization: OptimizationRecord): string => {
  const { input } = optimization;
  const scenario = input.model.definition.scenarios?.find(
    (candidate) => candidate.id === input.scenario.id,
  );
  const metric = input.model.definition.metrics?.find(
    (candidate) => candidate.id === input.objective.metricId,
  );
  const direction =
    input.objective.direction === "maximize" ? "Maximize" : "Minimize";
  return `${scenario?.name ?? input.scenario.id} · ${direction} ${metric?.name ?? input.objective.metricId}`;
};

const OptimizationSummary = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) => {
  const finishedSteps = finishedStepCount(optimization);
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
          bar={stepsBar(
            optimization,
            `Steps · ${finishedSteps} / ${optimization.requestedTrials}`,
          )}
          secondaryBar={followedStepBar(optimization)}
          batches={activityBatches(optimization)}
        />
      </div>
      {optimization.error ? (
        <span className={errorStyle}>{optimization.error}</span>
      ) : null}
    </div>
  );
};

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
      <Section
        title="Summary"
        collapsible
        defaultOpen
        className={fixedSectionStyle}
      >
        <OptimizationSummary optimization={optimization} />
      </Section>
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
            bestTrial={null}
            className={cx(stepsScrollStyle, remoteStepsHeightStyle)}
          />
        </Section>
      ) : null}
    </>
  );
};

/**
 * A study evaluated in this browser, laid out so everything is in view at
 * once: the summary strip, the parameter controls with their state line, the
 * surface beside the objective's chart, and the steps filling what is left.
 * The navigation drives the surface and the chart, following each step while
 * the study runs.
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
  const running = isOptimizationActive(optimization);

  return (
    <>
      <div className={fixedSectionStyle}>
        <StudySummaryStrip optimization={optimization} />
      </div>
      <Section
        title="Parameters"
        tooltip={PARAMETERS_HELP}
        className={fixedSectionStyle}
        renderHeaderAction={() => (
          <OptimizationNavigatorStatus
            navigation={navigation}
            selection={optimization.selection}
            running={running}
            onNavigationChange={onNavigationChange}
          />
        )}
        // Not collapsible: the navigator stays usable while the plots
        // beside each other stream.
        renderStickyBand={() => (
          <OptimizationNavigator
            axes={optimization.axes}
            booleanParameters={optimizationBooleanIdentifiers(
              optimization.input,
            )}
            navigation={navigation}
            running={running}
            onNavigationChange={onNavigationChange}
          />
        )}
      >
        {null}
      </Section>
      <div className={panesStyle}>
        {optimization.axes.length >= 2 ? (
          <NavigatedOptimizationSurface
            key={`surface-${optimization.id}`}
            optimization={optimization}
            navigation={navigation}
            selection={optimization.selection}
            onNavigationChange={onNavigationChange}
            controls={<HelpTooltip content={SURFACE_HELP} />}
          />
        ) : null}
        {/* Keyed so faded previous pictures never leak from one study into
            another when the drawer swaps records. */}
        <OptimizationMetrics
          key={`metrics-${optimization.id}`}
          optimization={optimization}
          selection={optimization.selection}
        />
      </div>
      <div className={connectedStepsStyle}>
        <StepsTable
          optimization={optimization}
          bestTrial={optimization.best?.trial ?? null}
          className={cx(stepsScrollStyle, connectedStepsHeightStyle)}
        />
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
        description={describeStudy(optimization)}
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
