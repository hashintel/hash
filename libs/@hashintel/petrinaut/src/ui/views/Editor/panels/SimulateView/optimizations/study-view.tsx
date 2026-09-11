/**
 * One study in the shared frame, for the drawer and the full view alike: the
 * one-line title with the progress line beside it, the stats and the compute
 * badge, the steps bar; the Parameters band across the body; then, arranged
 * by the frame's width, the surface, the chart cards (the objective at the
 * point, the objective by step, Constraints when the study declares any,
 * Sensitivity analysis) and the steps table; and the actions in the footer.
 */
import { use, type ReactNode } from "react";

import { Button, HelpTooltip, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  type ConnectedStudyState,
  followedTrial,
  isOptimizationActive,
  type OptimizationNavigation,
  type OptimizationRecord,
  OptimizationsContext,
} from "../../../../../../react/optimizations/context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
import {
  CHART_CARD_MIN_WIDTH,
  ChartCardGrid,
  chartCardHeight,
  ChartCardMenu,
  type ChartCardTone,
} from "../shared/chart-card";
import { ComputeBackendBadge } from "../shared/compute-backend-badge";
import {
  DrawerFrame,
  FrameBand,
  FrameColumns,
  type FrameNote,
} from "../shared/drawer-frame";
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
import { stepsProgressPercent } from "./study-view/shared/study-progress";
import { StepsTable } from "./study-view/steps-table";
import { StudyHeader } from "./study-view/study-header";
import { type StudyPhase, studyPhase } from "./study-view/study-phase";
import { StudyStats } from "./study-view/study-stats";

import type { PetrinautSimulatePresentation } from "../../../../../../react/state/editor-context";

export { studyPhase, type StudyPhase } from "./study-view/study-phase";
export { describeStudyProgress } from "./study-view/study-header";

/** Every chart card of a study is this tall; the surface card, with its footer, comes to the same. */
const STUDY_CARD_HEIGHT = chartCardHeight({
  bodyHeight: OBJECTIVE_PLOT_HEIGHT,
});
/** The steps table's fixed height in pixels; the steps scroll inside it. */
const STEPS_TABLE_HEIGHT = 320;

const stepsStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

const stepsScrollStyle = css({
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

const REMOTE_SURFACE_HELP =
  "The objective over two optimized parameters, computed locally on this machine; the study's own trials appear as rings. Move the sliders or click the plot to recompute elsewhere.";

/** The scenario and the objective, the title's second and third parts. */
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

/** The frame's one-line title: `Supply chain · Base scenario · Maximize Profit`. */
const studyTitle = (optimization: OptimizationRecord): string =>
  `${optimization.input.name} · ${describeStudy(optimization)}`;

/**
 * What the objective's timeline describes: the step in flight while a live
 * study is followed, otherwise the point the navigation holds. A settled
 * study never follows, so its title never reads as live.
 */
const objectiveAtPointTitle = (
  phase: StudyPhase,
  selection: ConnectedStudyState["selection"],
): string =>
  phase === "live" &&
  selection !== null &&
  followedTrial(selection.key) !== null
    ? "Objective at the step in flight"
    : "Objective at the selected point";

/** The frame's note row: the error when the study failed, else the resume note while paused. */
const studyNote = (optimization: OptimizationRecord): FrameNote | null => {
  if (optimization.error) {
    return { content: optimization.error, tone: "error" };
  }
  if (optimization.status === "paused" && optimization.connected) {
    return {
      content: (
        <span data-resume-note>
          Resuming continues the study's history; it does not reproduce the
          draws an uninterrupted run would have made.
        </span>
      ),
      tone: "muted",
    };
  }
  return null;
};

const BestParametersBand = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) =>
  optimization.best ? (
    <FrameBand title="Best parameters">
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
    </FrameBand>
  ) : null;

const StudySteps = ({
  optimization,
  bestTrial,
}: {
  optimization: OptimizationRecord;
  bestTrial: number | null;
}) => (
  <div className={stepsStyle} data-study-steps>
    <StepsTable
      optimization={optimization}
      bestTrial={bestTrial}
      className={stepsScrollStyle}
      height={STEPS_TABLE_HEIGHT}
    />
  </div>
);

/** A study run elsewhere: the best parameters, the objective by step, the experimental surface and the steps. */
const RemoteStudyBody = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) => {
  const { enableOptimizationSurface } = use(UserSettingsContext);
  const surfaceEligible =
    enableOptimizationSurface && optimization.axes.length >= 2;

  return (
    <>
      <BestParametersBand optimization={optimization} />
      <FrameColumns
        primary={
          surfaceEligible ? (
            <FrameBand title="Surface" help={REMOTE_SURFACE_HELP}>
              <OptimizationSurface
                key={optimization.id}
                optimization={optimization}
              />
            </FrameBand>
          ) : undefined
        }
        secondary={
          <ChartCardGrid
            minColumnWidth={CHART_CARD_MIN_WIDTH}
            rowHeight={STUDY_CARD_HEIGHT}
          >
            <ObjectiveHistoryCard
              optimization={optimization}
              plotHeight={OBJECTIVE_PLOT_HEIGHT}
            />
          </ChartCardGrid>
        }
        after={
          optimization.trials.length > 0 ? (
            <StudySteps optimization={optimization} bestTrial={null} />
          ) : undefined
        }
      />
    </>
  );
};

/**
 * A study evaluated in this browser: the parameter controls with their state
 * line across the body, then the surface on one side, the chart cards on the
 * other, the steps beneath. The navigation drives the surface and the
 * objective's timeline, following each step while the study runs.
 */
const ConnectedStudyBody = ({
  optimization,
  connected,
}: {
  optimization: OptimizationRecord;
  connected: ConnectedStudyState;
}) => {
  const { setOptimizationNavigation } = use(OptimizationsContext);
  const onNavigationChange = (patch: Partial<OptimizationNavigation>) =>
    setOptimizationNavigation(optimization.id, patch);
  const phase = studyPhase(optimization);
  // The paused study keeps the running layout: the same cards, frozen.
  const tone: ChartCardTone =
    optimization.status === "paused" ? "paused" : "default";

  return (
    <>
      <NavigatorBand
        optimization={optimization}
        connected={connected}
        running={phase === "live"}
        onNavigationChange={onNavigationChange}
      />
      <FrameColumns
        primary={
          optimization.axes.length >= 2 ? (
            <NavigatedOptimizationSurface
              key={`surface-${optimization.id}`}
              optimization={optimization}
              connected={connected}
              onNavigationChange={onNavigationChange}
              actions={<HelpTooltip content={SURFACE_HELP} align="center" />}
              tone={tone}
            />
          ) : undefined
        }
        secondary={
          <ChartCardGrid
            minColumnWidth={CHART_CARD_MIN_WIDTH}
            rowHeight={STUDY_CARD_HEIGHT}
          >
            {/* Keyed so faded previous pictures never leak from one study into
                another when the surface swaps records. */}
            <OptimizationMetrics
              key={`metrics-${optimization.id}`}
              optimization={optimization}
              selection={connected.selection}
              title={objectiveAtPointTitle(phase, connected.selection)}
              tone={tone}
            />
            <ObjectiveHistoryCard
              optimization={optimization}
              plotHeight={OBJECTIVE_PLOT_HEIGHT}
              tone={tone}
            />
            {(optimization.input.constraints ?? []).length > 0 ? (
              <ConstraintSummaryCard
                optimization={optimization}
                selection={connected.selection}
                plotHeight={OBJECTIVE_PLOT_HEIGHT}
                tone={tone}
              />
            ) : null}
            {/* Only a study evaluated here receives importances; a remote study
                has no panel rather than an empty one. */}
            <ParameterImportancePanel
              optimization={optimization}
              plotHeight={OBJECTIVE_PLOT_HEIGHT}
              tone={tone === "paused" ? tone : undefined}
            />
          </ChartCardGrid>
        }
        after={
          <StudySteps
            optimization={optimization}
            bestTrial={optimization.best?.trial ?? null}
          />
        }
      />
    </>
  );
};

/** The body of a study in either surface, arranged by the frame's width. */
const StudyBody = ({ optimization }: { optimization: OptimizationRecord }) =>
  optimization.connected ? (
    <ConnectedStudyBody
      optimization={optimization}
      connected={optimization.connected}
    />
  ) : (
    <RemoteStudyBody optimization={optimization} />
  );

/** The button that moves the navigation to the best step and computes there. */
const RefineBestButton = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) => {
  const { refineOptimizationBest } = use(OptimizationsContext);
  return (
    <Button
      variant="subtle"
      tone="neutral"
      size="sm"
      prefix={<Icon name="bullseye" size="sm" />}
      disabled={optimization.best === null}
      onClick={() => refineOptimizationBest(optimization.id)}
    >
      Run at the best configuration
    </Button>
  );
};

/**
 * The footer of a paused connected study: Resume (once the segment has
 * drained and the study is resumable), Run at the best configuration, and an
 * overflow menu holding Remove so it never sits beside the primary actions.
 */
const PausedStudyActions = ({
  optimization,
  onClose,
}: {
  optimization: OptimizationRecord;
  onClose?: () => void;
}) => {
  const { resumeOptimization, removeOptimization } = use(OptimizationsContext);
  const owed = optimization.requestedTrials - optimization.trials.length;
  const resumable = (optimization.connected?.resumable ?? false) && owed > 0;
  return (
    <>
      <ChartCardMenu
        label="More actions"
        items={[
          {
            id: "remove",
            text: "Remove",
            onClick: () => {
              removeOptimization(optimization.id);
              onClose?.();
            },
          },
        ]}
      />
      <RefineBestButton optimization={optimization} />
      <Button
        variant="solid"
        tone="neutral"
        size="sm"
        prefix={<Icon name="play" size="sm" />}
        disabled={!resumable}
        onClick={() => {
          void resumeOptimization(optimization.id).catch(() => undefined);
        }}
      >
        Resume
      </Button>
    </>
  );
};

/**
 * Pause and Stop (connected) or Cancel (remote) while active; Resume and Run
 * at the best configuration while paused; Continue, Remove and Retry as a
 * settled study allows; plus the switch to the other presentation. `onClose`
 * is called when the surface should leave the record: after Remove, and from
 * the drawer's Close button.
 */
const StudyActions = ({
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
    pauseOptimization,
    removeOptimization,
    extendOptimization,
    retryOptimization,
  } = use(OptimizationsContext);
  const active = isOptimizationActive(optimization);
  const paused = optimization.status === "paused";
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
      {paused ? (
        <PausedStudyActions optimization={optimization} onClose={onClose} />
      ) : null}
      {!active && !paused ? (
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
      {!active && !paused && connected ? (
        <RefineBestButton optimization={optimization} />
      ) : null}
      {active ? (
        <Button
          variant={connected ? "ghost" : "subtle"}
          tone="neutral"
          size="sm"
          prefix={<Icon name="stop" size="sm" />}
          onClick={() => cancelOptimization(optimization.id)}
        >
          {connected ? "Stop" : "Cancel"}
        </Button>
      ) : null}
      {active && connected ? (
        <Button
          variant="solid"
          tone="neutral"
          size="sm"
          prefix={<Icon name="pause" size="sm" />}
          onClick={() => pauseOptimization(optimization.id)}
        >
          Pause
        </Button>
      ) : null}
      {connected?.resumable && !paused ? (
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

/**
 * The whole study in the shared frame. `drawer` puts it in a ds Drawer over
 * the list; without it the frame fills the section, with `leading` (Back to
 * list) before the title. `onClose` leaves the record: after Remove, and
 * from the drawer's Close button.
 */
export const StudyFrame = ({
  optimization,
  presentation,
  drawer,
  leading,
  onClose,
}: {
  optimization: OptimizationRecord;
  presentation: PetrinautSimulatePresentation;
  drawer?: { onClose: () => void; swapKey: string };
  leading?: ReactNode;
  onClose: () => void;
}) => {
  const { setSimulatePresentation } = use(EditorContext);
  const { connected } = optimization;

  return (
    <DrawerFrame
      drawer={drawer}
      leading={leading}
      title={studyTitle(optimization)}
      headline={<StudyHeader optimization={optimization} />}
      stats={<StudyStats optimization={optimization} />}
      badge={
        connected ? (
          <ComputeBackendBadge
            backend={{
              computeBackend: optimization.computeBackend,
              computeBackendFallbackReason:
                connected.computeBackendFallbackReason,
            }}
          />
        ) : undefined
      }
      progress={stepsProgressPercent(optimization)}
      note={studyNote(optimization)}
      footer={
        <StudyActions
          optimization={optimization}
          presentation={presentation}
          onPresentationChange={setSimulatePresentation}
          onClose={onClose}
        />
      }
    >
      <StudyBody optimization={optimization} />
    </DrawerFrame>
  );
};
