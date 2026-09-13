/**
 * An optimization record mapped onto the shared results view-model, for the
 * drawer and the full view alike: the one-line title with the progress line
 * beside it, the status and the stat columns (steps, steps clear, the best
 * step so far), the computing chip and the compute badge of a study
 * evaluated here, the Parameters card, the surface, the chart cards (the
 * objective at the point, the objective by step, Constraints when the study
 * declares any, Sensitivity analysis), the steps table, and the actions.
 * A study run elsewhere shows its best parameters, the objective by step,
 * the experimental surface and its steps; its cards are there from the first
 * render, dashes until the first step reports, so nothing moves mid-stream.
 */
import { use } from "react";

import { HelpTooltip } from "@hashintel/ds-components";

import {
  constraintAlpha,
  formatRate,
  type StudyConstraintRates,
  studyConstraintRates,
} from "../../../../../../react/optimizations/constraint-rates";
import {
  type ConnectedStudyState,
  finishedTrialCount,
  followedTrial,
  isOptimizationActive,
  type OptimizationNavigation,
  type OptimizationRecord,
  OptimizationsContext,
} from "../../../../../../react/optimizations/context";
import {
  optimizationBooleanIdentifiers,
  partitionParameterBindings,
} from "../../../../../../react/optimizations/surface-grid";
import {
  EditorContext,
  type PetrinautSimulatePresentation,
} from "../../../../../../react/state/editor-context";
import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
import {
  CHART_CARD_FOOTER_CHROME,
  type ChartCardTone,
} from "../shared/chart-card";
import { formatNumber, formatParameters } from "../shared/format-value";
import {
  directionWord,
  objectiveMetric,
  objectiveMetricName,
  scenarioName,
} from "../shared/study-labels";
import {
  SURFACE_FOOTER_HEIGHT,
  SURFACE_PLOT_HEIGHT,
} from "../shared/surface-frame";
import {
  OPTIMIZATION_STATUS_DISPLAY,
  optimizationDisplayStatus,
  WIDEST_OPTIMIZATION_STATUS,
} from "./optimization-status";
import {
  NavigatedOptimizationSurface,
  OptimizationSurface,
} from "./optimization-surface";
import { ConstraintSummaryCard } from "./study-results/constraint-summary";
import { ObjectiveHistoryCard } from "./study-results/objective-history-card";
import {
  OptimizationNavigator,
  OptimizationNavigatorStatus,
} from "./study-results/optimization-navigator";
import { ParameterImportancePanel } from "./study-results/parameter-importance-panel";
import { ParameterValues } from "./study-results/parameter-values";
import {
  PresentationToggle,
  StudyActions,
} from "./study-results/study-actions";
import { StudyHeader } from "./study-results/study-header";
import {
  activityBatches,
  stepsProgressPercent,
} from "./study-results/study-progress";
import { StudySteps } from "./study-results/study-steps";

import type { FrameNote } from "../shared/drawer-frame";
import type {
  ResultsBand,
  ResultsMetrics,
  ResultsModel,
  ResultsStat,
  ResultsStatus,
} from "../shared/results-model";

/**
 * The objective plot's height: sized so the card ends level with the surface
 * card beside it, that card's plot plus the footer row holding its axis
 * selects. Every chart card of a study is this tall.
 */
export const OBJECTIVE_PLOT_HEIGHT =
  SURFACE_PLOT_HEIGHT + SURFACE_FOOTER_HEIGHT + CHART_CARD_FOOTER_CHROME;

/** The widest objective `formatNumber` prints: a sign, six significant digits and an exponent. */
const WIDEST_OBJECTIVE = "-0.00000e+00";

const PARAMETERS_HELP =
  "The chart beside the surface shows the objective at this point. While the study runs and Follow steps is on, the point follows each step as it is evaluated and the controls only show it; turn Follow steps off, or wait for the study to finish, to move them and look elsewhere.";

const SURFACE_HELP =
  "The objective over two optimized parameters, drawn from the study's own steps: each step is a dot, the best emphasized, pruned steps hollow, and the field is interpolated between them. The ringed dot is the step being evaluated, filling in as it runs; once the study is over, or Follow steps is off, click or drag the plot to refine a point.";

const REMOTE_SURFACE_HELP =
  "The objective over two optimized parameters, computed locally on this machine; the study's own trials appear as rings. Move the sliders or click the plot to recompute elsewhere.";

/** The scenario and the objective, the title's second and third parts. */
const describeStudy = (optimization: OptimizationRecord): string => {
  const { input } = optimization;
  return `${scenarioName(input)} · ${directionWord(input.objective.direction)} ${objectiveMetricName(input)}`;
};

/** The frame's one-line title: `Supply chain · Base scenario · Maximize Profit`. */
const studyTitle = (optimization: OptimizationRecord): string =>
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
    `${finishedTrialCount(optimization)} / ${optimization.requestedTrials}`,
    ...(runsPerStep > 1 ? [`${runsPerStep} runs each`] : []),
    ...(parallelism > 1 ? [`${parallelism} at once`] : []),
  ].join(" · ");
};

const studyStatus = (optimization: OptimizationRecord): ResultsStatus => ({
  ...OPTIMIZATION_STATUS_DISPLAY[optimizationDisplayStatus(optimization)],
  widest: WIDEST_OPTIMIZATION_STATUS,
});

/** The study's constraint rates; null for a study without constraints. */
const constraintRates = (
  optimization: Pick<OptimizationRecord, "input" | "trials">,
): StudyConstraintRates | null =>
  (optimization.input.constraints ?? []).length > 0
    ? studyConstraintRates(
        optimization.trials,
        constraintAlpha(optimization.input),
      )
    : null;

/** The stat columns after the status pill, each sized for its widest value. */
const studyStats = (
  optimization: OptimizationRecord,
  rates: StudyConstraintRates | null,
): ResultsStat[] => {
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
      // Narrow, the count alone: the runs per step and the parallelism go.
      short: {
        text: `${finishedTrialCount(optimization)} / ${optimization.requestedTrials}`,
        widest: `${optimization.requestedTrials} / ${optimization.requestedTrials}`,
      },
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
 * What the objective's timeline describes: the step in flight while an
 * active study is followed, otherwise the point the navigation holds. A
 * settled study never follows, so its title never reads as live.
 */
const objectiveAtPointTitle = (
  active: boolean,
  selection: ConnectedStudyState["selection"],
): string =>
  active && selection !== null && followedTrial(selection.key) !== null
    ? "Objective at the step in flight"
    : "Objective at the selected point";

/** The frame's note row: the error when the study failed, else the resume note while paused. */
const studyNote = (optimization: OptimizationRecord): FrameNote | null => {
  if (optimization.error) {
    return { content: optimization.error, tone: "error" };
  }
  if (optimization.status === "paused" && optimization.connected) {
    return {
      content:
        "Resuming continues the study's history; it does not reproduce the draws an uninterrupted run would have made.",
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
  rates: StudyConstraintRates | null,
): ResultsMetrics => {
  const { input, connected } = optimization;
  const metric = objectiveMetric(input);
  const selection = connected?.selection ?? null;
  return {
    key: optimization.id,
    tiles:
      connected && metric
        ? [
            {
              id: "objective",
              title: objectiveAtPointTitle(
                isOptimizationActive(optimization),
                selection,
              ),
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
        {connected && rates !== null ? (
          <ConstraintSummaryCard
            optimization={optimization}
            selection={selection}
            rates={rates}
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
  const { fixed, optimized } = partitionParameterBindings(optimization.input);
  const fixedCount = Object.keys(fixed).length;
  const optimizedCount = Object.keys(optimized).length;
  return {
    id: `parameters-${optimization.id}`,
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
    below: null,
    more:
      fixedCount === 0
        ? null
        : {
            show: `Show ${fixedCount} fixed ${fixedCount === 1 ? "parameter" : "parameters"}`,
            hide: "Hide fixed parameters",
            content: <ParameterValues values={fixed} />,
          },
    tone: "default",
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
    <OptimizationSurface
      key={optimization.id}
      optimization={optimization}
      actions={<HelpTooltip content={REMOTE_SURFACE_HELP} align="center" />}
      tone={tone}
    />
  ) : null;
};

/**
 * The Best parameters card of a remote study: one row per optimized
 * parameter from the first render, `—` until the first step reports, so the
 * card is exactly as tall before a best as after.
 */
const bestParametersBand = (optimization: OptimizationRecord): ResultsBand => {
  const { best } = optimization;
  const { optimized } = partitionParameterBindings(optimization.input);
  return {
    id: "best-parameters",
    title: "Best parameters",
    subtitle: best
      ? `Step ${best.trial + 1} · ${formatNumber(best.objective)}`
      : "Step — · —",
    trailing: null,
    content: (
      <ParameterValues
        values={Object.fromEntries(
          Object.keys(optimized).map((identifier) => [
            identifier,
            best?.parameters[identifier] ?? null,
          ]),
        )}
      />
    ),
    below: null,
    more: null,
    tone: "default",
  };
};

export const studyResultsModel = (
  optimization: OptimizationRecord,
  dependencies: StudyResultsDependencies,
): ResultsModel => {
  const { connected } = optimization;
  const active = isOptimizationActive(optimization);
  const rates = constraintRates(optimization);
  // The paused study keeps the running layout: the same cards, frozen.
  const tone: ChartCardTone =
    optimization.status === "paused" ? "paused" : "default";

  return {
    header: {
      title: studyTitle(optimization),
      headline: <StudyHeader optimization={optimization} />,
      status: studyStatus(optimization),
      stats: studyStats(optimization, rates),
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
    bands: [
      connected
        ? parametersBand(
            optimization,
            connected,
            active,
            dependencies.onNavigationChange,
          )
        : bestParametersBand(optimization),
    ],
    surface: studySurface(optimization, tone, dependencies),
    metrics: studyMetrics(optimization, tone, rates),
    after: (
      <StudySteps
        optimization={optimization}
        bestTrial={optimization.best?.trial ?? null}
      />
    ),
    footer: (
      <StudyActions
        optimization={optimization}
        presentation={dependencies.presentation}
        onClose={dependencies.onClose}
      />
    ),
    footerSecondary: (
      <PresentationToggle
        presentation={dependencies.presentation}
        onPresentationChange={dependencies.onPresentationChange}
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
