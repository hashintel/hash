import type { HirMetricArtifact } from "../../../hir-runtime";
import type { SimulationFrameReader } from "../../api";
import type { MonteCarloMetricNumericAccumulatorState } from "./accumulators";

export type MonteCarloMetricRunStatus =
  | "ready"
  | "running"
  | "complete"
  | "error";

export type MonteCarloActiveRunPlaceCountsVisitor = (
  runIndex: number,
  /**
   * Dense place-count view indexed by `placeIds`.
   *
   * Metric implementations must treat this as read-only.
   */
  placeCounts: Uint32Array,
) => void;

export type MonteCarloRunFrameMetricView = {
  runIndex: number;
  status: MonteCarloMetricRunStatus;
  frame: SimulationFrameReader;
};

export type MonteCarloRunFrameMetricVisitor = (
  run: MonteCarloRunFrameMetricView,
) => void;

export type MonteCarloFrameMetricContext = {
  frameNumber: number;
  time: number;
  runCount: number;
  activeRunCount: number;
  completedRunCount: number;
  erroredRunCount: number;
  placeIds: readonly string[];
  placeNames: readonly string[];
  forEachActiveRunPlaceCounts: (
    visitor: MonteCarloActiveRunPlaceCountsVisitor,
  ) => void;
  /**
   * Visits every run's current frame as a reader.
   *
   * User-defined metrics can use this to compute arbitrary scalar samples from
   * place token values, transition state, and frame metadata. The reader is only
   * valid during the `observeFrame` call.
   */
  forEachRunFrame: (visitor: MonteCarloRunFrameMetricVisitor) => void;
};

export type MonteCarloFrameMetric = {
  observeFrame: (context: MonteCarloFrameMetricContext) => void;
};

export type MonteCarloUserDefinedMetricAggregation =
  | "mean"
  | "sum"
  | "min"
  | "max"
  | "last";

export type MonteCarloUserDefinedMetricTimeAggregation =
  | MonteCarloUserDefinedMetricAggregation
  | "none";

export type MonteCarloUserDefinedMetricSampleRuns =
  | "active"
  | "completed"
  | "all";

export type MonteCarloMetricDistributionBinning = "exact" | { width: number };

export type MonteCarloMetricRunOutput =
  | {
      type: "scalar";
      aggregateRuns?: MonteCarloUserDefinedMetricAggregation;
    }
  | {
      type: "distribution";
      binning?: MonteCarloMetricDistributionBinning;
    };

export type MonteCarloUserDefinedMetricMeasureInput = {
  runIndex: number;
  status: MonteCarloMetricRunStatus;
  frame: SimulationFrameReader;
};

export type MonteCarloUserDefinedMetricConfig = {
  id: string;
  label?: string;
  /**
   * Computes one numeric sample for one run at the current frame.
   *
   * Return `null`, `undefined`, or `NaN` to skip that run for this frame.
   */
  measure: (
    input: MonteCarloUserDefinedMetricMeasureInput,
  ) => number | null | undefined;
  sampleRuns?: MonteCarloUserDefinedMetricSampleRuns;
  /**
   * Controls how sampled run values are represented for each frame.
   *
   * Defaults to scalar output using `aggregateRuns`. Distribution output keeps
   * the run axis unaggregated and bins the sampled run values.
   */
  runOutput?: MonteCarloMetricRunOutput;
  /**
   * Aggregates the per-run samples into the frame value.
   *
   * Defaults to `mean`, which gives the average value over all sampled runs for
   * the current frame.
   */
  aggregateRuns?: MonteCarloUserDefinedMetricAggregation;
  /**
   * Optionally aggregates values over time.
   *
   * Defaults to `none`. For scalar output, this aggregates the scalar frame
   * values and exposes the result as `value`. For distribution output, this
   * aggregates each sampled run over time before binning the resulting per-run
   * values.
   */
  aggregateTime?: MonteCarloUserDefinedMetricTimeAggregation;
};

export type MonteCarloMetricSpecBase = {
  id: string;
  label: string;
  sampleRuns?: MonteCarloUserDefinedMetricSampleRuns;
  runOutput?: MonteCarloMetricRunOutput;
  aggregateRuns?: MonteCarloUserDefinedMetricAggregation;
  aggregateTime?: MonteCarloUserDefinedMetricTimeAggregation;
};

export type MonteCarloPlaceTokenCountMeanMetricSpec =
  MonteCarloMetricSpecBase & {
    kind: "placeTokenCountMean";
    placeId: string;
  };

export type MonteCarloTransitionFiringCountMetricSpec =
  MonteCarloMetricSpecBase & {
    kind: "transitionFiringCount";
    transitionId: string;
    mode?: "firedInThisFrame" | "cumulative";
  };

export type MonteCarloExpressionMetricSpec = MonteCarloMetricSpecBase & {
  kind: "expression";
  /**
   * Function body over the same `state` object as persisted timeline
   * metrics. It must `return` a finite number. Kept for display/persistence;
   * execution uses only `artifact`.
   */
  code: string;
  /**
   * HIR-compiled buffer program for `code` (from `compileHirArtifacts`).
   * This is the only execution path — specs without an artifact cannot run.
   */
  artifact: HirMetricArtifact;
};

export type MonteCarloMetricSpec =
  | MonteCarloExpressionMetricSpec
  | MonteCarloPlaceTokenCountMeanMetricSpec
  | MonteCarloTransitionFiringCountMetricSpec;

type MonteCarloUserDefinedMetricFrameBase = {
  metricId: string;
  label: string;
  frameNumber: number;
  time: number;
  runSampleCount: number;
};

export type MonteCarloUserDefinedMetricDistributionBin = readonly [
  value: number,
  frequency: number,
];

/**
 * How far every bin of a frame reaches below and above its labelled value:
 * a bin labelled `v` holds the samples in `[v - below, v + above)`. Set by
 * producers that bin at a known width (width binning labels a bin by its
 * lower edge; a GPU histogram window labels a stride of integer counts by
 * its middle count). Exact bins carry no extent: they are points, and a
 * consumer drawing them picks the resolution.
 */
export type MonteCarloUserDefinedMetricBinExtent = {
  readonly below: number;
  readonly above: number;
};

export type MonteCarloUserDefinedScalarMetricFrame =
  MonteCarloUserDefinedMetricFrameBase & {
    outputType: "scalar";
    /**
     * The primary scalar to display for this frame.
     *
     * This is the per-frame aggregate unless `aggregateTime` is configured, in
     * which case it is the aggregate over time.
     */
    value: number | null;
    frameValue: number | null;
    timeValue: number | null;
    timeSampleCount: number;
    /**
     * Mergeable across-runs accumulator state behind `frameValue`.
     *
     * `frameValue` is already reduced and cannot be combined across a sharded
     * experiment (a mean of means is not a mean). This state can, via the
     * numeric accumulator monoid — see `metrics/merge.ts`.
     */
    runAggregate: MonteCarloMetricNumericAccumulatorState;
    /** How `runAggregate` reduces to `frameValue`; needed to merge shards. */
    aggregateRuns: MonteCarloUserDefinedMetricAggregation;
    /** How frame values reduce over time; re-applied after shards merge. */
    aggregateTime: MonteCarloUserDefinedMetricTimeAggregation;
  };

export type MonteCarloUserDefinedDistributionMetricFrame =
  MonteCarloUserDefinedMetricFrameBase & {
    outputType: "distribution";
    bins: readonly MonteCarloUserDefinedMetricDistributionBin[];
    /** Absent when the bins are exact values. */
    binExtent?: MonteCarloUserDefinedMetricBinExtent;
    value: null;
    frameValue: null;
    timeValue: null;
    timeSampleCount: number;
  };

/**
 * Runtime-only user-defined metrics can either keep one scalar aggregate per
 * frame or a distribution across sampled runs. When `aggregateTime` is set on a
 * distribution metric, each run is aggregated over time before values are
 * binned.
 */
export type MonteCarloUserDefinedMetricFrame =
  | MonteCarloUserDefinedScalarMetricFrame
  | MonteCarloUserDefinedDistributionMetricFrame;

export type MonteCarloUserDefinedMetric = MonteCarloFrameMetric & {
  readonly id: string;
  readonly label: string;
  readonly frames: readonly MonteCarloUserDefinedMetricFrame[];
  getLatestFrame: () => MonteCarloUserDefinedMetricFrame | null;
  /**
   * Latest sampled value per run index.
   *
   * A run keeps its frozen state once it completes, so after the experiment
   * finishes each entry holds the run's final-frame value — what a single-run
   * evaluation of the same metric would report. Optimization replicates read
   * their per-seed objectives from this.
   */
  getRunValues: () => ReadonlyMap<number, number>;
  clear: () => void;
};
