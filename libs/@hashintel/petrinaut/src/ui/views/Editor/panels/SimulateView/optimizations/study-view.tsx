/**
 * The body of a study, shared by the drawer and the full view: a fixed
 * summary band (the header line, the strip, the progress bar) above one
 * scrolling region holding the navigator band, the surface, the objective at
 * the selected point, the objective by step and the steps table. The two
 * surfaces arrange the same pieces; `layout` says how.
 */
import { use } from "react";

import { Button, HelpTooltip, Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import {
  type ConnectedStudyState,
  followedTrial,
  isOptimizationActive,
  type OptimizationNavigation,
  type OptimizationRecord,
  OptimizationsContext,
} from "../../../../../../react/optimizations/context";
import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
import { Section, SectionList } from "../../../../../components/section";
import { formatScalar } from "../shared/format-value";
import {
  NavigatedOptimizationSurface,
  OptimizationSurface,
} from "./optimization-surface";
import { ConstraintSummaryCard } from "./study-view/constraint-summary";
import {
  ContinueControl,
  remainingOptimizationSteps,
} from "./study-view/continue-control";
import { NavigatorBand } from "./study-view/navigator-band";
import { ObjectiveHistoryCard } from "./study-view/objective-history-chart";
import {
  OBJECTIVE_PLOT_HEIGHT,
  OptimizationMetrics,
} from "./study-view/optimization-metrics";
import { ParameterImportancePanel } from "./study-view/parameter-importance-panel";
import { StepsTable } from "./study-view/steps-table";
import { type StudyPhase, studyPhase } from "./study-view/study-phase";
import { StudySummaryBand } from "./study-view/study-summary-strip";

import type { PetrinautSimulatePresentation } from "../../../../../../react/state/editor-context";

export { studyPhase, type StudyPhase } from "./study-view/study-phase";
export { describeStudyProgress } from "./study-view/study-header";

/** How a study body is arranged: stacked for the drawer, or spread over the section's width. */
export type StudyLayout = "drawer" | "full";

// The band holds still; only the region beneath it scrolls, so condensing
// or growing the band never moves the body's scroll offset.
const bodyStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
  overflow: "hidden",
});

const scrollRegionStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
  overflowY: "auto",
  scrollbarWidth: "[thin]",
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

// A connected study's steps get whatever height the panes above leave. The
// table's own header names the columns, so no section title precedes it.
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
  minHeight: "[160px]",
});

const fullStepsHeightStyle = css({
  minHeight: "[240px]",
});

// The chart cards side by side, all the same height; a lone card on the
// last row of the drawer takes the whole row rather than half of it.
const panesStyle = css({
  display: "grid",
  alignItems: "stretch",
  gap: "5",
  paddingTop: "2.5",
  paddingBottom: "2",
});

const drawerPanesStyle = css({
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 400px), 1fr))",
  "& > :last-child:nth-child(odd)": { gridColumn: "[1 / -1]" },
});

const fullPanesStyle = css({
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))",
});

const historyBlockStyle = css({
  paddingTop: "2.5",
  paddingBottom: "3",
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

const SURFACE_HELP =
  "The objective over two optimized parameters, drawn from the study's own steps: each step is a dot, the best emphasized, pruned steps hollow, and the field is interpolated between them. The ringed dot is the step being evaluated, filling in as it runs; once the study is over, or Follow steps is off, click or drag the plot to refine a point.";

/** The header's second line: the scenario and the objective. */
export const describeStudy = (optimization: OptimizationRecord): string => {
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

/**
 * What the objective's timeline describes: the step in flight while a live
 * study is followed, otherwise the point the navigation holds. A settled
 * study never follows, so its title never reads as live.
 */
export const objectiveAtPointTitle = (
  phase: StudyPhase,
  selection: ConnectedStudyState["selection"],
): string =>
  phase === "live" &&
  selection !== null &&
  followedTrial(selection.key) !== null
    ? "Objective at the step in flight"
    : "Objective at the selected point";

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

/** A study run elsewhere: the summary, the results, the objective by step and the experimental surface. */
const RemoteStudyBody = ({
  optimization,
  layout,
}: {
  optimization: OptimizationRecord;
  layout: StudyLayout;
}) => {
  const { enableOptimizationSurface } = use(UserSettingsContext);
  const surfaceEligible =
    enableOptimizationSurface && optimization.axes.length >= 2;

  return (
    <div className={bodyStyle}>
      <StudySummaryBand optimization={optimization} />
      <SectionList>
        <div className={scrollRegionStyle}>
          <BestParametersSection optimization={optimization} />
          <div className={cx(fixedSectionStyle, historyBlockStyle)}>
            <ObjectiveHistoryCard
              optimization={optimization}
              plotHeight={layout === "full" ? OBJECTIVE_PLOT_HEIGHT : 200}
            />
          </div>
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
        </div>
      </SectionList>
    </div>
  );
};

/**
 * A study evaluated in this browser: the header and the summary, the
 * parameter controls with their state line, the chart cards (the surface, the
 * objective at the point, the objective by step, Constraints when the study
 * declares any, and Parameter importance), and the steps filling what is
 * left. The navigation drives the surface and the objective's timeline,
 * following each step while the study runs.
 */
const ConnectedStudyBody = ({
  optimization,
  connected,
  layout,
}: {
  optimization: OptimizationRecord;
  connected: ConnectedStudyState;
  layout: StudyLayout;
}) => {
  const { setOptimizationNavigation } = use(OptimizationsContext);
  const onNavigationChange = (patch: Partial<OptimizationNavigation>) =>
    setOptimizationNavigation(optimization.id, patch);
  const phase = studyPhase(optimization);

  return (
    <div className={bodyStyle}>
      <StudySummaryBand optimization={optimization} />
      <div className={scrollRegionStyle}>
        <NavigatorBand
          optimization={optimization}
          connected={connected}
          running={phase === "live"}
          onNavigationChange={onNavigationChange}
        />
        <div
          className={cx(
            panesStyle,
            layout === "full" ? fullPanesStyle : drawerPanesStyle,
          )}
        >
          {optimization.axes.length >= 2 ? (
            <NavigatedOptimizationSurface
              key={`surface-${optimization.id}`}
              optimization={optimization}
              connected={connected}
              onNavigationChange={onNavigationChange}
              actions={<HelpTooltip content={SURFACE_HELP} align="center" />}
            />
          ) : null}
          {/* Keyed so faded previous pictures never leak from one study into
            another when the surface swaps records. */}
          <OptimizationMetrics
            key={`metrics-${optimization.id}`}
            optimization={optimization}
            selection={connected.selection}
            title={objectiveAtPointTitle(phase, connected.selection)}
          />
          <ObjectiveHistoryCard
            optimization={optimization}
            plotHeight={OBJECTIVE_PLOT_HEIGHT}
          />
          {(optimization.input.constraints ?? []).length > 0 ? (
            <ConstraintSummaryCard
              optimization={optimization}
              selection={connected.selection}
              plotHeight={OBJECTIVE_PLOT_HEIGHT}
            />
          ) : null}
          {/* Only a study evaluated here receives importances; a remote study
            has no panel rather than an empty one. */}
          <ParameterImportancePanel
            optimization={optimization}
            plotHeight={OBJECTIVE_PLOT_HEIGHT}
          />
        </div>
        <div className={connectedStepsStyle}>
          <StepsTable
            optimization={optimization}
            bestTrial={optimization.best?.trial ?? null}
            className={cx(
              stepsScrollStyle,
              layout === "full"
                ? fullStepsHeightStyle
                : connectedStepsHeightStyle,
            )}
          />
        </div>
      </div>
    </div>
  );
};

/**
 * The whole body of a study in either surface: the fixed summary band, then
 * the scrolling region. The surface around it must not scroll on its own.
 */
export const StudyBody = ({
  optimization,
  layout,
}: {
  optimization: OptimizationRecord;
  /** `drawer` stacks for the overlay; `full` spreads the chart cards over the section's width. */
  layout: StudyLayout;
}) =>
  optimization.connected ? (
    <ConnectedStudyBody
      optimization={optimization}
      connected={optimization.connected}
      layout={layout}
    />
  ) : (
    <RemoteStudyBody optimization={optimization} layout={layout} />
  );

/**
 * Stop or Cancel, Continue, Remove and Retry as the study allows, plus the
 * switch to the other presentation. `onClose` is called when the surface
 * should leave the record: after Remove, and from the drawer's Close button.
 */
export const StudyActions = ({
  optimization,
  presentation,
  onPresentationChange,
  onClose,
}: {
  optimization: OptimizationRecord;
  presentation: PetrinautSimulatePresentation;
  onPresentationChange: (presentation: PetrinautSimulatePresentation) => void;
  onClose?: () => void;
}) => {
  const {
    cancelOptimization,
    removeOptimization,
    extendOptimization,
    retryOptimization,
  } = use(OptimizationsContext);
  const active = isOptimizationActive(optimization);
  const { connected } = optimization;

  return (
    <>
      {presentation === "drawer" ? (
        <Button
          variant="subtle"
          tone="neutral"
          size="sm"
          prefix={<Icon name="expand" size="sm" />}
          onClick={() => onPresentationChange("full")}
        >
          Open full view
        </Button>
      ) : (
        <Button
          variant="subtle"
          tone="neutral"
          size="sm"
          prefix={<Icon name="collapse" size="sm" />}
          onClick={() => onPresentationChange("drawer")}
        >
          Show in drawer
        </Button>
      )}
      {!active ? (
        <Button
          variant="subtle"
          tone="error"
          size="sm"
          prefix={<Icon name="trash" size="sm" />}
          onClick={() => {
            removeOptimization(optimization.id);
            onClose?.();
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
      {connected?.resumable ? (
        <ContinueControl
          // Reset with the segment, so the count starts fresh after each
          // continuation.
          key={optimization.requestedTrials}
          defaultSteps={optimization.input.study.trials}
          remainingSteps={remainingOptimizationSteps(
            optimization.requestedTrials,
          )}
          onContinue={(steps) =>
            extendOptimization(optimization.id, steps).catch(() => undefined)
          }
        />
      ) : null}
      {optimization.status === "error" ? (
        <Button
          variant="subtle"
          tone="neutral"
          size="sm"
          prefix={<Icon name="rotate" size="sm" />}
          // Retrying selects the new run, so the surface re-points at it and
          // shows the fresh attempt, as creating a run does. Closing here
          // would undo that selection.
          onClick={() => {
            void retryOptimization(optimization.id);
          }}
        >
          Retry
        </Button>
      ) : null}
      {presentation === "drawer" && onClose ? (
        <Button variant="solid" tone="neutral" size="sm" onClick={onClose}>
          Close
        </Button>
      ) : null}
    </>
  );
};
