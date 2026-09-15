import { Fragment, use } from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  ExperimentsActionsContext,
  type ExperimentsActionsValue,
  type ExperimentRecord,
  isExperimentActive,
  type SweepBatchStatus,
} from "../../../../../../react/experiments/context";
import {
  constraintAlpha,
  formatRate,
  type StudyConstraintRates,
  studyConstraintRates,
} from "../../../../../../react/optimizations/constraint-rates";
import {
  finishedTrialCount,
  type OptimizationRecord,
} from "../../../../../../react/optimizations/context";
import { experimentProgressPercent } from "../../../shared/experiment-progress";
import { describeStepProgress } from "../shared/describe-study-progress";
import { formatCount, formatFixed } from "../shared/format-value";
import { METRIC_PLOT_HEIGHT, type MetricTile } from "../shared/metric-tiles";
import { constraintsFold } from "./experiment-results/constraints-fold";
import { ElapsedStat } from "./experiment-results/elapsed-stat";
import {
  ExperimentDetails,
  type ExperimentDetail,
} from "./experiment-results/experiment-details";
import { ParameterImportancePanel } from "./experiment-results/parameter-importance-panel";
import { StudyConstraintsCard } from "./experiment-results/study-constraints-card";
import { StudyHeader } from "./experiment-results/study-header";
import { StudySteps } from "./experiment-results/study-steps";
import { SweepNavigator } from "./sweep-navigator";
import { SweepObjectiveStrip } from "./sweep-objective-strip";
import {
  type SweepOptimizer,
  type SweepStepProgress,
  useSweepOptimizer,
} from "./sweep-optimizer";
import { SweepSurface } from "./sweep-surface";

import type { ChartCardTone } from "../shared/chart-card";
import type { ComputeBatch } from "../shared/drawer-frame";
import type {
  ResultsModel,
  ResultsStat,
  ResultsStatus,
} from "../shared/results-model";

/** The record's status, or the study's while one drives the sweep. */
type ExperimentDisplayStatus = ExperimentRecord["status"] | "optimizing";

const STATUS_DISPLAY: Record<
  ExperimentDisplayStatus,
  Pick<ResultsStatus, "label" | "tone">
> = {
  initializing: { label: "Initializing", tone: "active" },
  running: { label: "Running", tone: "active" },
  optimizing: { label: "Optimizing", tone: "active" },
  idle: { label: "Ready", tone: "neutral" },
  complete: { label: "Complete", tone: "done" },
  error: { label: "Error", tone: "error" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/** The longest status label, so the pill keeps its width as the status changes. */
const WIDEST_STATUS = Object.values(STATUS_DISPLAY)
  .map((entry) => entry.label)
  .reduce((widest, label) => (label.length > widest.length ? label : widest));

const PARAMETERS_HELP =
  "Choose a value or range for each parameter. Results update as you move the controls. During optimization, the controls follow the values being tested.";

// The ds Button has no purple tone; the optimizer's Stop wears the
// optimizing purple over the subtle variant.
const stopButtonStyle = css({
  color: "purple.s110",
  backgroundColor: "purple.s10",
  borderColor: "purple.s60",
  flexShrink: "0",
  "&:not([aria-disabled=true]):hover": {
    backgroundColor: "purple.s20",
    borderColor: "purple.s80",
  },
});

/**
 * The sweep's batches as the computing list shows them: a sweep's only
 * batches are the rungs of the selection's ladder, named for the step while
 * a study places the selection.
 */
const experimentComputeBatches = (
  sweepBatches: readonly SweepBatchStatus[],
  following: SweepStepProgress | null,
): ComputeBatch[] =>
  sweepBatches.map((batch) => ({
    id: String(batch.id),
    label: following ? `Step ${following.step}` : "Selection",
    tone: "priority",
    runCount: batch.runCount,
    completedRuns: batch.completedRuns,
  }));

/**
 * Simulated time to show when no batch is publishing progress: a complete
 * run has taken every run to the end, and so has an idle or cancelled sweep
 * once a batch of its selection finished; a sweep that never computed sits
 * at zero.
 */
const settledTime = (experiment: ExperimentRecord): number =>
  experiment.status === "complete" ||
  (experiment.sweep !== null &&
    experiment.sweep.runsCompleted > 0 &&
    (experiment.status === "idle" || experiment.status === "cancelled"))
    ? experiment.maxTime
    : 0;

const experimentDetailsStats = (
  experiment: ExperimentRecord,
): ExperimentDetail[] => {
  const { progress, sweep } = experiment;
  const runCount = formatCount(experiment.runCount);
  const maxTime = formatFixed(experiment.maxTime);
  return [
    sweep
      ? {
          id: "selection",
          label: "Runs sampled",
          value: {
            text: `${formatCount(sweep.runsSampled)} / ${runCount} runs`,
          },
        }
      : {
          id: "runs",
          label: "Runs",
          value: {
            text: progress
              ? `${formatCount(progress.activeRuns)} active, ${formatCount(progress.completedRuns)} complete`
              : runCount,
          },
        },
    {
      id: "errors",
      label: "Errors",
      value: { text: formatCount(progress?.erroredRuns ?? 0) },
    },
    {
      id: "time",
      label: "Simulation time",
      value: {
        text: `${formatFixed(progress?.time ?? settledTime(experiment))} / ${maxTime}`,
      },
    },
    // Wall-clock, as distinct from the simulated time; it stops once the
    // experiment finishes and is dashed out when stepping never began. The
    // leaf keeps its own clock, so the tick re-renders nothing else. A sweep
    // never finishes, so it has no clock.
    ...(sweep
      ? []
      : [
          {
            id: "elapsed",
            label: "Elapsed time",
            value: {
              text: (
                <ElapsedStat
                  startedAt={experiment.startedAt}
                  finishedAt={experiment.finishedAt}
                  active={isExperimentActive(experiment)}
                />
              ),
            },
          },
        ]),
  ];
};

/** The study's constraint rates; null for a study without constraints. */
const studyRates = (
  study: Pick<OptimizationRecord, "input" | "trials"> | null,
): StudyConstraintRates | null =>
  study !== null && (study.input.constraints ?? []).length > 0
    ? studyConstraintRates(study.trials, constraintAlpha(study.input))
    : null;

const studyDetailsStats = (
  study: OptimizationRecord,
  rates: StudyConstraintRates | null,
): ExperimentDetail[] => {
  return [
    {
      id: "steps",
      label: "Steps",
      value: { text: describeStepProgress(study) },
    },
    ...(rates === null
      ? []
      : [
          {
            id: "steps-clear",
            label: "Steps clear",
            value: { text: formatRate(rates.stepsClear, rates.stepsSimulated) },
          },
        ]),
  ];
};

/**
 * One tile per configured metric, fed the record's frames. Called from the
 * hook on the two record fields alone, so a publish that keeps the frames
 * array (progress, batches, an optimizer change) hands every plot the same
 * `frames` and no chart redraws.
 */
export const experimentMetricTiles = (
  metricFrames: ExperimentRecord["metricFrames"],
  metricSpecs: ExperimentRecord["metricSpecs"],
): MetricTile[] => {
  const framesById = new Map<string, MetricTile["frames"][number][]>();
  for (const frame of metricFrames) {
    const frames = framesById.get(frame.metricId) ?? [];
    frames.push(frame);
    framesById.set(frame.metricId, frames);
  }
  return metricSpecs.map((spec) => ({
    id: spec.id,
    title: spec.label,
    metricName: null,
    frames: framesById.get(spec.id) ?? [],
    outputType:
      spec.runOutput?.type === "distribution" ? "distribution" : "scalar",
  }));
};

export type ExperimentResultsDependencies = {
  /** The metric tiles, split from the record's frames once per frames array. */
  tiles: readonly MetricTile[];
  actions: Pick<
    ExperimentsActionsValue,
    "cancelExperiment" | "removeExperiment" | "setSweepSelection"
  >;
  /** The study the sweep was created with, which its Parameters card follows. */
  optimizer: SweepOptimizer;
  /** Leaves the record: after Remove, and from the Close button. */
  onClose: () => void;
};

export const experimentResultsModel = (
  experiment: ExperimentRecord,
  { tiles, actions, optimizer, onClose }: ExperimentResultsDependencies,
): ResultsModel => {
  const { sweep } = experiment;
  // The study's step while one drives the sweep: the header, the batch list,
  // the navigator and the surface all read it, so they agree in one render.
  const following = optimizer.driving;
  const displayStatus: ExperimentDisplayStatus = following
    ? "optimizing"
    : experiment.status;
  const canCancel =
    experiment.requestActive === true ||
    isExperimentActive(experiment) ||
    following !== null;
  // The navigator and the surface only display while the selection is not
  // the user's to move: a study drives it, or the sweep was cancelled and its
  // session is gone. A failed selection locks nothing — the next selection
  // computes afresh — and a sweep never completes.
  const locked =
    experiment.requestActive === true ||
    following !== null ||
    experiment.status === "cancelled";
  const tone: ChartCardTone = following ? "optimizing" : "default";
  // The study's displays are there from the drawer's first frame for an
  // experiment created with Optimize, whatever the study's status.
  const { study } = optimizer;
  const rates = studyRates(study);

  const detailStats = [
    ...experimentDetailsStats(experiment),
    ...(study === null ? [] : studyDetailsStats(study, rates)),
  ];
  const runCount = formatCount(experiment.runCount);
  const completedRuns = formatCount(
    experiment.progress?.completedRuns ??
      (experiment.status === "complete" ? experiment.runCount : 0),
  );
  const failedRuns = experiment.progress?.erroredRuns ?? 0;
  const stats: ResultsStat[] = [
    ...(sweep
      ? []
      : [
          {
            id: "runs",
            label: "Completed runs",
            widest: `${runCount} / ${runCount} runs`,
            value: {
              text: `${completedRuns} / ${runCount} runs`,
            },
          },
        ]),
    ...(study === null
      ? []
      : [
          {
            id: "steps",
            label: "Optimization steps",
            widest: `${study.requestedTrials} / ${study.requestedTrials} steps`,
            value: {
              text: `${finishedTrialCount(study)} / ${study.requestedTrials} steps`,
            },
          },
        ]),
    ...(failedRuns > 0
      ? [
          {
            id: "errors",
            label: "Failed runs",
            widest: `${runCount} failed runs`,
            value: {
              text: `${formatCount(failedRuns)} failed ${failedRuns === 1 ? "run" : "runs"}`,
            },
          },
        ]
      : []),
  ];

  return {
    header: {
      title: experiment.name,
      headline: (
        <ExperimentDetails
          key={experiment.id}
          experiment={experiment}
          stats={detailStats}
          batches={experimentComputeBatches(experiment.sweepBatches, following)}
        >
          {study === null ? null : <StudyHeader optimization={study} />}
        </ExperimentDetails>
      ),
      status: { ...STATUS_DISPLAY[displayStatus], widest: WIDEST_STATUS },
      stats,
      activity: null,
      compute: null,
      // A driven sweep's own bar would saw once per step; the study's steps
      // finished are what progresses.
      progress: following
        ? ((following.step - 1) / following.total) * 100
        : experimentProgressPercent(experiment),
      // The experiment's own failure first; else the study's, whose record
      // has no other home than this drawer.
      note:
        experiment.error !== null
          ? { content: experiment.error, tone: "error" }
          : study?.status === "error" && study.error !== null
            ? { content: study.error, tone: "error" }
            : null,
    },
    bands: sweep
      ? [
          {
            id: `parameters-${experiment.id}`,
            title: "Parameters",
            subtitle: "",
            help: PARAMETERS_HELP,
            // Stop comes and goes inside the card header's fixed height.
            trailing: following ? (
              <Button
                className={stopButtonStyle}
                variant="subtle"
                tone="neutral"
                size="xs"
                iconName="stop"
                tooltip="Stop optimization"
                data-sweep-optimizing
                disabled={experiment.requestActive}
                onClick={optimizer.stop}
              >
                Stop
              </Button>
            ) : null,
            content: (
              <SweepNavigator
                axes={experiment.parameterAxes}
                selection={sweep.selection}
                status={{
                  computing: sweep.computing,
                  following: following
                    ? { kind: "following", ...following }
                    : study === null
                      ? null
                      : {
                          kind: "settled",
                          summary:
                            study.status === "complete"
                              ? "Optimization complete"
                              : study.status === "cancelled"
                                ? "Optimization stopped"
                                : study.status === "error"
                                  ? "Optimization failed"
                                  : "Starting optimization",
                        },
                  runsCompleted: sweep.runsCompleted,
                  runsSampled: sweep.runsSampled,
                  runTarget: sweep.runTarget,
                  runCount: experiment.runCount,
                }}
                disabled={locked}
                onSelectionChange={(selection) =>
                  actions.setSweepSelection(experiment.id, selection)
                }
              />
            ),
            // The study under the sliders; a sweep created without one keeps
            // the card exactly as without.
            below:
              study === null ? null : (
                <SweepObjectiveStrip
                  key={experiment.id}
                  study={study}
                  driving={following !== null}
                />
              ),
            // The constraints the experiment carries, from creation on; a
            // property of the experiment, not of any study.
            more:
              experiment.constraints.length > 0
                ? constraintsFold(experiment)
                : null,
            tone,
          },
        ]
      : [],
    surface:
      sweep && experiment.parameterAxes.length >= 2 ? (
        // Keyed so the axis and metric pickers never carry one experiment's
        // identifiers into another when the drawer swaps records in place.
        <SweepSurface
          key={experiment.id}
          experiment={experiment}
          following={following !== null}
          disabled={locked}
          tone={tone}
        />
      ) : null,
    metrics:
      tiles.length > 0
        ? {
            // Keyed so view choices never leak from one experiment into
            // another when the drawer swaps records in place.
            key: experiment.id,
            tiles,
            timeDomain: [0, experiment.maxTime],
            // What the frames represent: a selection change fades the previous
            // picture out inside each plot instead of cutting to the sparse
            // new stream. The session keys the selection once per publish.
            contentEpoch: sweep?.selectionKey ?? "",
            plotHeight: METRIC_PLOT_HEIGHT,
            tone: "default",
            // Keyed on the study, so the cards start afresh when the drawer
            // swaps records in place. The Sensitivity card decides its own
            // tone from the study's step floor.
            cards:
              study === null ? null : (
                <Fragment key={study.id}>
                  {rates === null ? null : (
                    <StudyConstraintsCard
                      optimization={study}
                      rates={rates}
                      plotHeight={METRIC_PLOT_HEIGHT}
                      tone={tone}
                    />
                  )}
                  <ParameterImportancePanel
                    optimization={study}
                    plotHeight={METRIC_PLOT_HEIGHT}
                  />
                </Fragment>
              ),
          }
        : null,
    after:
      study === null ? null : (
        <StudySteps
          optimization={study}
          bestTrial={study.best?.trial ?? null}
        />
      ),
    footer: (
      <>
        {canCancel ? (
          <Button
            variant="subtle"
            tone="neutral"
            size="sm"
            prefix={<Icon name="stop" size="sm" />}
            // A study driving the sweep stops first, or it would prune
            // every remaining step against a sweep that is gone.
            onClick={() => {
              optimizer.stop();
              actions.cancelExperiment(experiment.id);
            }}
          >
            Cancel
          </Button>
        ) : null}
        <Button variant="solid" tone="neutral" size="sm" onClick={onClose}>
          Close
        </Button>
      </>
    ),
    // Remove holds the footer's left edge: Cancel comes and goes beside Close
    // without moving it.
    footerSecondary: (
      <Button
        variant="subtle"
        tone="neutral"
        size="sm"
        prefix={<Icon name="trash" size="sm" />}
        disabled={experiment.requestActive}
        onClick={() => {
          optimizer.discard();
          actions.removeExperiment(experiment.id);
          onClose();
        }}
      >
        Remove
      </Button>
    ),
  };
};

/**
 * The tiles behind a hook boundary of their own: the compiler caches a hook's
 * result on what the hook read (the two record fields) and treats it as
 * frozen afterwards, whereas the same call inline shares a cache with the
 * model call it feeds (which may, for all the compiler knows, mutate its
 * arguments) and is rebuilt with it. The directive compiles the hook although
 * it calls no other.
 */
const useExperimentMetricTiles = (
  experiment: ExperimentRecord,
): readonly MetricTile[] => {
  "use memo";
  return experimentMetricTiles(experiment.metricFrames, experiment.metricSpecs);
};

/** The model for the experiment, from the actions provider and the optimizer. */
export const useExperimentResultsModel = (
  experiment: ExperimentRecord,
  onClose: () => void,
): ResultsModel => {
  const actions = use(ExperimentsActionsContext);
  const optimizer = useSweepOptimizer(experiment);
  const tiles = useExperimentMetricTiles(experiment);
  return experimentResultsModel(experiment, {
    tiles,
    actions,
    optimizer,
    onClose,
  });
};
