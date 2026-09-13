/**
 * An experiment record mapped onto the shared results view-model: the
 * one-line title, the status and the stat columns (runs, errors, simulated
 * time, wall-clock time, the selection's sampling for a sweep), the
 * computing chip and the compute badge, the Parameters card with its
 * optimizer control and the surface for a sweep, one metric card per
 * configured metric, and Remove, Cancel and Close in the footer.
 */
import { use, useEffect, useState } from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  ExperimentsActionsContext,
  type ExperimentsActionsValue,
  type ExperimentRecord,
  getExperimentElapsedMs,
  isExperimentActive,
  type SweepBatchStatus,
} from "../../../../../../react/experiments/context";
import { experimentProgressPercent } from "../../../shared/experiment-progress";
import { type ComputeBatch } from "../shared/drawer-frame";
import { formatFixed } from "../shared/format-value";
import { METRIC_PLOT_HEIGHT, type MetricTile } from "../shared/metric-tiles";
import { formatDurationMs } from "./format-duration";
import { SweepNavigator } from "./sweep-navigator";
import { SweepOptimizeControl } from "./sweep-optimize-control";
import {
  studyStepProgress,
  type SweepOptimizer,
  useSweepOptimizer,
} from "./sweep-optimizer";
import { SweepSurface } from "./sweep-surface";

import type { ChartCardTone } from "../shared/chart-card";
import type {
  ResultsModel,
  ResultsStat,
  ResultsStatus,
} from "../shared/results";

const STATUS_DISPLAY: Record<
  ExperimentRecord["status"],
  Pick<ResultsStatus, "label" | "tone">
> = {
  initializing: { label: "Initializing", tone: "active" },
  running: { label: "Running", tone: "active" },
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
  "Only the selected combination computes. Move a control and compute follows it; results for visited combinations are kept and drawn on the Surface. Optimize lets an optimizer pick the points, one metric in view.";

// Keeps its footprint when a run can no longer be cancelled, so Remove and
// Close do not slide when a run finishes.
const cancelSlotStyle = css({
  display: "inline-flex",
  "&[data-hidden=true]": { visibility: "hidden" },
});

/** The frame's one-line title: `SIR transmission sweep · Seasonal Flu · 100 runs`. */
export const describeExperiment = (
  experiment: Pick<ExperimentRecord, "name" | "scenarioName" | "runCount">,
): string =>
  `${experiment.name} · ${experiment.scenarioName ?? "Default scenario"} · ${experiment.runCount.toLocaleString("en-US")} runs`;

/** A sweep's only batches are the rungs of the selection's ladder. */
const BATCH_KIND_META: Record<
  SweepBatchStatus["kind"],
  Pick<ComputeBatch, "label" | "tone">
> = {
  selection: { label: "Selection", tone: "priority" },
};

/** The sweep's batches as the computing list shows them. */
export const experimentComputeBatches = (
  sweepBatches: readonly SweepBatchStatus[],
): ComputeBatch[] =>
  sweepBatches.map((batch) => ({
    id: String(batch.id),
    ...BATCH_KIND_META[batch.kind],
    runCount: batch.runCount,
    completedRuns: batch.completedRuns,
  }));

const formatCount = (value: number): string => value.toLocaleString("en-US");

/**
 * Simulated time to show when no batch is publishing progress: an idle sweep
 * or a complete run has taken every run to the end.
 */
const settledTime = (experiment: ExperimentRecord): number =>
  experiment.status === "idle" || experiment.status === "complete"
    ? experiment.maxTime
    : 0;

/** The stat columns after the status pill, each sized for its widest value. */
export const experimentStats = (
  experiment: ExperimentRecord,
  now: number,
): ResultsStat[] => {
  const { progress } = experiment;
  const elapsedMs = getExperimentElapsedMs(experiment, now);
  const runCount = formatCount(experiment.runCount);
  const maxTime = formatFixed(experiment.maxTime);
  // The widest time readout: a fraction just under the maximum, which prints
  // its three decimals, over the maximum.
  const widestTime = `${formatFixed(Math.max(0, experiment.maxTime - 0.001))} / ${maxTime}`;
  return [
    {
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
    // experiment finishes and is dashed out when stepping never began.
    {
      id: "elapsed",
      label: "Elapsed",
      widest: WIDEST_DURATION,
      value: { text: elapsedMs === null ? "—" : formatDurationMs(elapsedMs) },
    },
    ...(experiment.sweep
      ? [
          {
            id: "selection",
            label: "Selection",
            widest: `${runCount} / ${runCount} runs`,
            value: {
              text: `${formatCount(experiment.sweep.runsSampled)} / ${runCount} runs`,
            },
            short: {
              text: `${formatCount(experiment.sweep.runsSampled)} / ${runCount}`,
              widest: `${runCount} / ${runCount}`,
            },
          },
        ]
      : []),
  ];
};

/** One tile per configured metric, fed the record's frames. */
export const experimentMetricTiles = (
  experiment: ExperimentRecord,
): MetricTile[] => {
  const framesById = new Map<string, MetricTile["frames"][number][]>();
  for (const frame of experiment.metricFrames) {
    const frames = framesById.get(frame.metricId) ?? [];
    frames.push(frame);
    framesById.set(frame.metricId, frames);
  }
  return experiment.metricSpecs.map((spec) => ({
    id: spec.id,
    title: spec.label,
    metricName: null,
    frames: framesById.get(spec.id) ?? [],
    outputType:
      spec.runOutput?.type === "distribution" ? "distribution" : "scalar",
  }));
};

export type ExperimentResultsDependencies = {
  /** The wall clock, for the elapsed time. */
  now: number;
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
  { now, actions, optimizer, onClose }: ExperimentResultsDependencies,
): ResultsModel => {
  const { sweep } = experiment;
  const canCancel =
    experiment.status === "initializing" || experiment.status === "running";
  const tiles = experimentMetricTiles(experiment);
  const driving = optimizer.driving && optimizer.study !== null;
  const tone: ChartCardTone = driving ? "optimizing" : "default";

  return {
    header: {
      title: describeExperiment(experiment),
      headline: null,
      status: { ...STATUS_DISPLAY[experiment.status], widest: WIDEST_STATUS },
      stats: experimentStats(experiment, now),
      activity: experimentComputeBatches(experiment.sweepBatches),
      compute: experiment,
      progress: experimentProgressPercent(experiment),
      note:
        experiment.error === null
          ? null
          : { content: experiment.error, tone: "error" },
    },
    bands: sweep
      ? [
          {
            id: `parameters-${experiment.id}`,
            title: "Parameters",
            subtitle: `${experiment.parameterAxes.length} swept`,
            help: PARAMETERS_HELP,
            trailing: optimizer.available ? (
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
                  following:
                    driving && optimizer.study
                      ? studyStepProgress(optimizer.study)
                      : null,
                  runsCompleted: sweep.runsCompleted,
                  runsSampled: sweep.runsSampled,
                  runTarget: sweep.runTarget,
                  runCount: experiment.runCount,
                }}
                onSelectionChange={(selection) =>
                  actions.setSweepSelection(experiment.id, selection)
                }
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
          following={driving}
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
            // new stream.
            contentEpoch: JSON.stringify(sweep?.selection ?? null),
            plotHeight: METRIC_PLOT_HEIGHT,
            tone: "default",
            cards: null,
          }
        : null,
    after: null,
    footer: (
      <>
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
        <span
          className={cancelSlotStyle}
          data-hidden={!canCancel}
          aria-hidden={!canCancel}
        >
          <Button
            variant="subtle"
            tone="neutral"
            size="sm"
            prefix={<Icon name="stop" size="sm" />}
            disabled={!canCancel}
            // A study driving the sweep stops first, or it would prune
            // every remaining step against a sweep that is gone.
            onClick={() => {
              optimizer.stop();
              actions.cancelExperiment(experiment.id);
            }}
          >
            Cancel
          </Button>
        </span>
        <Button variant="solid" tone="neutral" size="sm" onClick={onClose}>
          Close
        </Button>
      </>
    ),
  };
};

/**
 * A clock that advances while `active`, so an elapsed-time readout keeps
 * moving even when a stalled run stops publishing progress.
 */
const useNow = (active: boolean): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return;
    }
    const update = () => setNow(Date.now());
    update();
    const intervalId = window.setInterval(update, 250);
    return () => window.clearInterval(intervalId);
  }, [active]);

  return now;
};

/** The model for the experiment, from the actions provider and the wall clock. */
export const useExperimentResultsModel = (
  experiment: ExperimentRecord,
  onClose: () => void,
): ResultsModel => {
  const actions = use(ExperimentsActionsContext);
  const optimizer = useSweepOptimizer(experiment);
  const now = useNow(isExperimentActive(experiment));
  return experimentResultsModel(experiment, {
    now,
    actions,
    optimizer,
    onClose,
  });
};
