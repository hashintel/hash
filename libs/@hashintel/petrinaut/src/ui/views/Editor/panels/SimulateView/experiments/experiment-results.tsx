/**
 * An experiment record mapped onto the shared results view-model: the
 * one-line title, the status and the stat columns (errors and simulated time
 * for both kinds; runs and wall-clock time for a plain experiment, the
 * selection's sampling for a sweep), the computing chip and the compute
 * badge, the Parameters card with its optimizer control and, once a study
 * ran, the objective strip under its sliders, the surface for a sweep, one
 * metric card per configured metric, and Remove, Cancel and
 * Close in the footer. While a study drives a sweep the header reads from
 * the study: Optimizing, its step as the progress, its step on the batch.
 */
import { use } from "react";

import { Button, Icon } from "@hashintel/ds-components";

import {
  ExperimentsActionsContext,
  type ExperimentsActionsValue,
  type ExperimentRecord,
  isExperimentActive,
  type SweepBatchStatus,
} from "../../../../../../react/experiments/context";
import { experimentProgressPercent } from "../../../shared/experiment-progress";
import { describeStudyProgress } from "../shared/describe-study-progress";
import { type ComputeBatch } from "../shared/drawer-frame";
import { formatCount, formatFixed } from "../shared/format-value";
import { METRIC_PLOT_HEIGHT, type MetricTile } from "../shared/metric-tiles";
import { ElapsedStat } from "./experiment-results/elapsed-stat";
import { SweepNavigator } from "./sweep-navigator";
import { SweepObjectiveStrip } from "./sweep-objective-strip";
import { SweepOptimizeControl } from "./sweep-optimize-control";
import {
  type SweepOptimizer,
  type SweepStepProgress,
  useSweepOptimizer,
} from "./sweep-optimizer";
import { SweepSurface } from "./sweep-surface";

import type { ChartCardTone } from "../shared/chart-card";
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
  idle: { label: "Idle", tone: "neutral" },
  complete: { label: "Complete", tone: "done" },
  error: { label: "Error", tone: "error" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/** The longest status label, so the pill keeps its width as the status changes. */
const WIDEST_STATUS = Object.values(STATUS_DISPLAY)
  .map((entry) => entry.label)
  .reduce((widest, label) => (label.length > widest.length ? label : widest));

/** The widest wall-clock readout `formatDurationMs` prints. */
const WIDEST_DURATION = "59m 59s";

const PARAMETERS_HELP =
  "Only the selected combination computes. Move a control and compute follows it; results for visited points are kept and drawn on the Surface. Optimize lets an optimizer pick the points, one metric in view.";

/** The frame's one-line title: `SIR transmission sweep · Seasonal Flu · 100 runs`. */
const describeExperiment = (
  experiment: Pick<ExperimentRecord, "name" | "scenarioName" | "runCount">,
): string =>
  `${experiment.name} · ${experiment.scenarioName ?? "Default scenario"} · ${formatCount(experiment.runCount)} runs`;

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

/**
 * The stat columns after the status pill, each sized for its widest value.
 * A plain experiment's runs and wall clock belong to a run that stops; a
 * sweep's selection carries its sampling instead, and its batches' progress
 * lives in the computing list.
 */
const experimentStats = (experiment: ExperimentRecord): ResultsStat[] => {
  const { progress, sweep } = experiment;
  const runCount = formatCount(experiment.runCount);
  const maxTime = formatFixed(experiment.maxTime);
  // The widest time readout: a fraction just under the maximum, which prints
  // its three decimals, over the maximum.
  const widestTime = `${formatFixed(Math.max(0, experiment.maxTime - 0.001))} / ${maxTime}`;
  return [
    sweep
      ? {
          id: "selection",
          label: "Selection",
          widest: `${runCount} / ${runCount} runs`,
          value: {
            text: `${formatCount(sweep.runsSampled)} / ${runCount} runs`,
          },
          short: {
            text: `${formatCount(sweep.runsSampled)} / ${runCount}`,
            widest: `${runCount} / ${runCount}`,
          },
        }
      : {
          id: "runs",
          label: "Runs",
          widest: `${runCount} active, ${runCount} complete`,
          value: {
            text: progress
              ? `${formatCount(progress.activeRuns)} active, ${formatCount(progress.completedRuns)} complete`
              : runCount,
          },
          // Narrow, the finished count alone.
          short: {
            text: progress
              ? `${formatCount(progress.completedRuns)} complete`
              : runCount,
            widest: `${runCount} complete`,
          },
        },
    {
      id: "errors",
      label: "Errors",
      widest: runCount,
      value: { text: formatCount(progress?.erroredRuns ?? 0) },
    },
    {
      id: "time",
      label: "Time",
      widest: widestTime,
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
            label: "Elapsed",
            widest: WIDEST_DURATION,
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
  /** The optimizer a sweep's Parameters card offers and follows. */
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
  const canCancel = isExperimentActive(experiment) || following !== null;
  // The navigator and the surface only display while the selection is not
  // the user's to move: a study drives it, or the sweep was cancelled and its
  // session is gone. A failed selection locks nothing — the next selection
  // computes afresh — and a sweep never completes.
  const locked = following !== null || experiment.status === "cancelled";
  const tone: ChartCardTone = following ? "optimizing" : "default";
  const { study, studies } = optimizer;

  return {
    header: {
      title: describeExperiment(experiment),
      headline: null,
      status: { ...STATUS_DISPLAY[displayStatus], widest: WIDEST_STATUS },
      stats: experimentStats(experiment),
      activity: experimentComputeBatches(experiment.sweepBatches, following),
      compute: experiment,
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
            subtitle: `${experiment.parameterAxes.length} swept`,
            help: PARAMETERS_HELP,
            // A cancelled sweep's session is gone, so a study could not
            // navigate it: nothing is left to optimize.
            trailing:
              optimizer.available && experiment.status !== "cancelled" ? (
                <SweepOptimizeControl
                  experiment={experiment}
                  optimizer={optimizer}
                />
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
                          summary: describeStudyProgress(study),
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
            // Every study started from the sweep, under the sliders, from the
            // first Optimize on; before it the card is exactly as without.
            below:
              studies.length === 0 ? null : (
                <SweepObjectiveStrip
                  studies={studies}
                  driving={following !== null}
                />
              ),
            more: null,
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
            cards: null,
          }
        : null,
    after: null,
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
