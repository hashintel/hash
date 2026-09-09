/**
 * An optimization record mapped onto the shared results view-model, for the
 * drawer and the full view alike: the one-line title with the progress line
 * beside it, the status and the stat columns (steps, steps clear, the best
 * step so far), the computing chip and the compute badge of a study
 * evaluated here, the Parameters card, the surface, the chart cards (the
 * objective at the point, the objective by step, Constraints when the study
 * declares any, Sensitivity analysis), the steps table, and the actions.
 * A study run elsewhere shows its best parameters, the objective by step,
 * the experimental surface and its steps.
 */
import { use } from "react";

import { HelpTooltip } from "@hashintel/ds-components";

import {
  constraintAlpha,
  formatRate,
  studyConstraintRates,
} from "../../../../../../react/optimizations/constraint-rates";
import {
  type ConnectedStudyState,
  followedTrial,
  type OptimizationNavigation,
  type OptimizationRecord,
  OptimizationsContext,
} from "../../../../../../react/optimizations/context";
import { optimizationBooleanIdentifiers } from "../../../../../../react/optimizations/surface-grid";
import {
  EditorContext,
  type PetrinautSimulatePresentation,
} from "../../../../../../react/state/editor-context";
import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
import {
  CHART_CARD_FOOTER_CHROME,
  type ChartCardTone,
} from "../shared/chart-card";
import {
  FrameBand,
  type FrameNote,
  type FrameStatusTone,
} from "../shared/drawer-frame";
import { formatNumber, formatParameters } from "../shared/format-value";
import {
  SURFACE_FOOTER_HEIGHT,
  SURFACE_PLOT_HEIGHT,
} from "../shared/surface-frame";
import { describeOptimizationStatus } from "./optimization-status";
import {
  NavigatedOptimizationSurface,
  OptimizationSurface,
} from "./optimization-surface";
import { ConstraintSummaryCard } from "./study-results/constraint-summary";
import { ObjectiveHistoryCard } from "./study-results/objective-history-chart";
import {
  OptimizationNavigator,
  OptimizationNavigatorStatus,
} from "./study-results/optimization-navigator";
import { ParameterImportancePanel } from "./study-results/parameter-importance-panel";
import { ParameterValues } from "./study-results/parameter-values";
import {
  activityBatches,
  finishedStepCount,
  stepsProgressPercent,
} from "./study-results/shared/study-progress";
import { StudyActions } from "./study-results/study-actions";
import { StudyHeader } from "./study-results/study-header";
import { type StudyPhase, studyPhase } from "./study-results/study-phase";
import { StudySteps } from "./study-results/study-steps";

import type {
  ResultsBand,
  ResultsMetrics,
  ResultsModel,
  ResultsStat,
  ResultsStatus,
} from "../shared/results";
import type { OptimizationScalar } from "@hashintel/petrinaut-core/optimization";

export { studyPhase, type StudyPhase } from "./study-results/study-phase";
export { describeStudyProgress } from "./study-results/study-header";

/**
 * The objective plot's height: sized so the card ends level with the surface
 * card beside it, that card's plot plus the footer row holding its axis
 * selects. Every chart card of a study is this tall.
 */
export const OBJECTIVE_PLOT_HEIGHT =
  SURFACE_PLOT_HEIGHT + SURFACE_FOOTER_HEIGHT + CHART_CARD_FOOTER_CHROME;

const STATUS_TONE: Record<OptimizationRecord["status"], FrameStatusTone> = {
  initializing: "active",
  running: "active",
  paused: "neutral",
  complete: "done",
  error: "error",
  cancelled: "neutral",
};

/** The longest status word, so the pill never reflows as it changes. */
const WIDEST_STATUS = "Reconnecting";

/** The widest objective `formatNumber` prints: a sign, six significant digits and an exponent. */
const WIDEST_OBJECTIVE = "-0.00000e+00";

const PARAMETERS_HELP =
  "The chart beside the surface shows the objective at this point. While the study runs and Follow steps is on, the point follows each step as it is evaluated and the controls only show it; turn Follow steps off, or wait for the study to finish, to move them and look elsewhere.";

const SURFACE_HELP =
  "The objective over two optimized parameters, drawn from the study's own steps: each step is a dot, the best emphasized, pruned steps hollow, and the field is interpolated between them. The ringed dot is the step being evaluated, filling in as it runs; once the study is over, or Follow steps is off, click or drag the plot to refine a point.";

const REMOTE_SURFACE_HELP =
  "The objective over two optimized parameters, computed locally on this machine; the study's own trials appear as rings. Move the sliders or click the plot to recompute elsewhere.";

/** The scenario and the objective, the title's second and third parts. */
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

/** The frame's one-line title: `Supply chain · Base scenario · Maximize Profit`. */
export const studyTitle = (optimization: OptimizationRecord): string =>
  `${optimization.input.name} · ${describeStudy(optimization)}`;

/** "4 / 30 · 3 runs each · 2 at once", with the parts that are 1 left out. */
export const describeStepProgress = (
  optimization: Pick<
    OptimizationRecord,
    | "completedTrials"
    | "prunedTrials"
    | "failedTrials"
    | "requestedTrials"
    | "connected"
    | "input"
  >,
): string => {
  const runsPerStep = optimization.input.execution.seedsPerTrial ?? 1;
  const parallelism = optimization.connected?.parallelism ?? 1;
  return [
    `${finishedStepCount(optimization)} / ${optimization.requestedTrials}`,
    ...(runsPerStep > 1 ? [`${runsPerStep} runs each`] : []),
    ...(parallelism > 1 ? [`${parallelism} at once`] : []),
  ].join(" · ");
};

/** The status word; a run whose event stream is being re-established says so instead. */
export const describeStudyStatus = (
  optimization: Pick<
    OptimizationRecord,
    "status" | "connected" | "connectionState"
  >,
): string =>
  optimization.connectionState === "reconnecting"
    ? "Reconnecting"
    : describeOptimizationStatus(optimization);

export const studyStatus = (
  optimization: OptimizationRecord,
): ResultsStatus => ({
  label: describeStudyStatus(optimization),
  tone: STATUS_TONE[optimization.status],
  widest: WIDEST_STATUS,
});

/** The stat columns after the status pill, each sized for its widest value. */
export const studyStats = (optimization: OptimizationRecord): ResultsStat[] => {
  const constrained = (optimization.input.constraints ?? []).length > 0;
  const rates = constrained
    ? studyConstraintRates(
        optimization.trials,
        constraintAlpha(optimization.input),
      )
    : null;
  return [
    {
      id: "steps",
      label: "Steps",
      widest: describeStepProgress({
        ...optimization,
        completedTrials: optimization.requestedTrials,
        prunedTrials: 0,
        failedTrials: 0,
      }),
      value: { text: describeStepProgress(optimization) },
    },
    ...(rates === null
      ? []
      : [
          {
            id: "steps-clear",
            label: "Steps clear",
            widest: formatRate(
              optimization.requestedTrials,
              optimization.requestedTrials,
            ),
            value: { text: formatRate(rates.stepsClear, rates.stepsSimulated) },
          },
        ]),
    {
      id: "best",
      label: "Best step so far",
      widest: WIDEST_OBJECTIVE,
      value: optimization.best
        ? {
            text: formatNumber(optimization.best.objective),
            tooltip: formatParameters(optimization.best.parameters),
          }
        : { text: "—" },
    },
  ];
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

/** The frame's note row: the error when the study failed, else the resume note while paused. */
export const studyNote = (
  optimization: OptimizationRecord,
): FrameNote | null => {
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

export type StudyResultsDependencies = {
  presentation: PetrinautSimulatePresentation;
  onPresentationChange: (presentation: PetrinautSimulatePresentation) => void;
  /** Forwards a connected study's navigation patches to the provider. */
  onNavigationChange: (patch: Partial<OptimizationNavigation>) => void;
  /** The experimental surface for a remote study, behind its setting. */
  enableOptimizationSurface: boolean;
  /** Leaves the record: after Remove, and from the drawer's Close button. */
  onClose: () => void;
};

/**
 * The metric cards of a study evaluated here: the objective at the point
 * (fed the selection stream: the step being evaluated while following, the
 * navigated point's refinement otherwise; a point that could not compute
 * shows the empty shell, the navigator's status line carries the reason),
 * then the objective by step, Constraints when declared, and Parameter
 * importance. A remote study has the objective by step alone: only a study
 * evaluated here receives importances.
 */
const studyMetrics = (
  optimization: OptimizationRecord,
  tone: ChartCardTone,
): ResultsMetrics => {
  const { input, connected } = optimization;
  const metric = input.model.definition.metrics?.find(
    (candidate) => candidate.id === input.objective.metricId,
  );
  const selection = connected?.selection ?? null;
  return {
    key: optimization.id,
    tiles:
      connected && metric
        ? [
            {
              id: "objective",
              title: objectiveAtPointTitle(studyPhase(optimization), selection),
              metricName: metric.name,
              frames:
                selection === null || selection.error !== null
                  ? []
                  : selection.metricFrames,
              outputType: "distribution",
            },
          ]
        : [],
    timeDomain: [0, input.execution.maxTime],
    contentEpoch: selection?.key ?? "",
    plotHeight: OBJECTIVE_PLOT_HEIGHT,
    tone,
    cards: (
      <>
        <ObjectiveHistoryCard
          optimization={optimization}
          plotHeight={OBJECTIVE_PLOT_HEIGHT}
          tone={tone}
        />
        {connected && (input.constraints ?? []).length > 0 ? (
          <ConstraintSummaryCard
            optimization={optimization}
            selection={selection}
            plotHeight={OBJECTIVE_PLOT_HEIGHT}
            tone={tone}
          />
        ) : null}
        {connected ? (
          <ParameterImportancePanel
            optimization={optimization}
            plotHeight={OBJECTIVE_PLOT_HEIGHT}
            tone={tone === "paused" ? tone : undefined}
          />
        ) : null}
      </>
    ),
  };
};

/** The parameters the manifest holds fixed, in the scenario's order. */
export const fixedParameters = (
  input: OptimizationRecord["input"],
): Record<string, OptimizationScalar> =>
  Object.fromEntries(
    Object.entries(input.scenario.parameterBindings).flatMap(
      ([identifier, binding]) =>
        binding.kind === "fixed" ? [[identifier, binding.value]] : [],
    ),
  );

/** The card's subtitle: `2 optimized · 3 fixed`, the fixed part left out when there are none. */
export const describeParameterCounts = (
  optimized: number,
  fixed: number,
): string =>
  fixed > 0
    ? `${optimized} optimized · ${fixed} fixed`
    : `${optimized} optimized`;

/**
 * The Parameters card of a connected study: the controls for the optimized
 * parameters, the navigator's status line in the header, and the parameters
 * held fixed folded away behind the footer button.
 */
const parametersBand = (
  optimization: OptimizationRecord,
  connected: ConnectedStudyState,
  running: boolean,
  onNavigationChange: StudyResultsDependencies["onNavigationChange"],
): ResultsBand => {
  const fixed = fixedParameters(optimization.input);
  const fixedCount = Object.keys(fixed).length;
  const optimizedCount =
    Object.keys(optimization.input.scenario.parameterBindings).length -
    fixedCount;
  return {
    id: "parameters",
    title: "Parameters",
    subtitle: describeParameterCounts(optimizedCount, fixedCount),
    help: PARAMETERS_HELP,
    trailing: (
      <OptimizationNavigatorStatus
        navigation={connected.navigation}
        selection={connected.selection}
        running={running}
        onNavigationChange={onNavigationChange}
      />
    ),
    content: (
      <OptimizationNavigator
        axes={optimization.axes}
        booleanParameters={optimizationBooleanIdentifiers(optimization.input)}
        navigation={connected.navigation}
        running={running}
        onNavigationChange={onNavigationChange}
      />
    ),
    more:
      fixedCount === 0
        ? null
        : {
            show: `Show ${fixedCount} fixed ${fixedCount === 1 ? "parameter" : "parameters"}`,
            hide: "Hide fixed parameters",
            content: <ParameterValues values={fixed} />,
          },
  };
};

const studySurface = (
  optimization: OptimizationRecord,
  tone: ChartCardTone,
  {
    onNavigationChange,
    enableOptimizationSurface,
  }: Pick<
    StudyResultsDependencies,
    "onNavigationChange" | "enableOptimizationSurface"
  >,
) => {
  if (optimization.axes.length < 2) {
    return null;
  }
  const { connected } = optimization;
  if (connected) {
    // Keyed so faded previous pictures never leak from one study into another
    // when the surface swaps records.
    return (
      <NavigatedOptimizationSurface
        key={`surface-${optimization.id}`}
        optimization={optimization}
        connected={connected}
        onNavigationChange={onNavigationChange}
        actions={<HelpTooltip content={SURFACE_HELP} align="center" />}
        tone={tone}
      />
    );
  }
  return enableOptimizationSurface ? (
    <FrameBand title="Surface" help={REMOTE_SURFACE_HELP}>
      <OptimizationSurface key={optimization.id} optimization={optimization} />
    </FrameBand>
  ) : null;
};

export const studyResultsModel = (
  optimization: OptimizationRecord,
  dependencies: StudyResultsDependencies,
): ResultsModel => {
  const { connected } = optimization;
  const phase = studyPhase(optimization);
  // The paused study keeps the running layout: the same cards, frozen.
  const tone: ChartCardTone =
    optimization.status === "paused" ? "paused" : "default";

  return {
    header: {
      title: studyTitle(optimization),
      headline: <StudyHeader optimization={optimization} />,
      status: studyStatus(optimization),
      stats: studyStats(optimization),
      activity: connected ? activityBatches(connected) : null,
      compute: connected
        ? {
            computeBackend: optimization.computeBackend,
            computeBackendFallbackReason:
              connected.computeBackendFallbackReason,
          }
        : null,
      progress: stepsProgressPercent(optimization),
      note: studyNote(optimization),
    },
    bands: connected
      ? [
          parametersBand(
            optimization,
            connected,
            phase === "live",
            dependencies.onNavigationChange,
          ),
        ]
      : optimization.best
        ? [
            {
              id: "best-parameters",
              title: "Best parameters",
              subtitle: `Step ${optimization.best.trial + 1} · ${formatNumber(optimization.best.objective)}`,
              trailing: null,
              content: (
                <ParameterValues values={optimization.best.parameters} />
              ),
              more: null,
            },
          ]
        : [],
    surface: studySurface(optimization, tone, dependencies),
    metrics: studyMetrics(optimization, tone),
    after:
      connected || optimization.trials.length > 0 ? (
        <StudySteps
          optimization={optimization}
          bestTrial={connected ? (optimization.best?.trial ?? null) : null}
        />
      ) : null,
    footer: (
      <StudyActions
        optimization={optimization}
        presentation={dependencies.presentation}
        onPresentationChange={dependencies.onPresentationChange}
        onClose={dependencies.onClose}
      />
    ),
  };
};

/** The model for the study, from the optimizations provider, the editor and the user's settings. */
export const useStudyResultsModel = (
  optimization: OptimizationRecord,
  {
    presentation,
    onClose,
  }: Pick<StudyResultsDependencies, "presentation" | "onClose">,
): ResultsModel => {
  const { setOptimizationNavigation } = use(OptimizationsContext);
  const { setSimulatePresentation } = use(EditorContext);
  const { enableOptimizationSurface } = use(UserSettingsContext);
  return studyResultsModel(optimization, {
    presentation,
    onPresentationChange: setSimulatePresentation,
    onNavigationChange: (patch) =>
      setOptimizationNavigation(optimization.id, patch),
    enableOptimizationSurface,
    onClose,
  });
};
