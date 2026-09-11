import { axisValueAt } from "../experiments/parameter-grid";
import { sweepCellObjective } from "../experiments/sweep-cell-objective";
import { sweepPointFor } from "../optimizations/sweep-evaluator/create-sweep-trial-evaluator";
import { prepareExperiment } from "./prepare-experiment";

import type {
  ExperimentRecord,
  ExperimentsActionsValue,
} from "../experiments/context";
import type {
  OptimizationRecord,
  OptimizationsContextValue,
} from "../optimizations/context";
import type {
  PetrinautExtensionSettings,
  ReadableStore,
  SDCPN,
} from "@hashintel/petrinaut-core";
import type {
  PetrinautExperimentHost,
  PetrinautExperimentProgress,
  PetrinautExperimentResult,
} from "@hashintel/petrinaut-core/ai";

export type ExperimentHostDependencies = {
  definition: SDCPN;
  extensions: PetrinautExtensionSettings;
  title: string;
  validate: (
    definition: SDCPN,
    extensions: PetrinautExtensionSettings,
  ) => Promise<void>;
  experiments: ReadableStore<readonly ExperimentRecord[]>;
  optimizations: ReadableStore<readonly OptimizationRecord[]>;
  actions: Pick<
    ExperimentsActionsValue,
    "createExperiment" | "navigateSweep" | "cancelExperiment"
  > &
    Pick<
      OptimizationsContextValue,
      "createOptimization" | "cancelOptimization"
    >;
};

const abortable = <Value>(
  operation: Promise<Value>,
  signal: AbortSignal,
): Promise<Value> =>
  new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) {
      cancel();
    }
    void operation
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", cancel));
  });

const waitForRecord = <Record extends { id: string }>(
  store: ReadableStore<readonly Record[]>,
  id: string,
  predicate: (record: Record) => boolean,
  signal: AbortSignal,
): Promise<Record> =>
  new Promise((resolve, reject) => {
    let off = () => {};
    const cancel = () => {
      off();
      reject(signal.reason);
    };
    const check = (records: readonly Record[]) => {
      const record = records.find((candidate) => candidate.id === id);
      if (record && predicate(record)) {
        off();
        signal.removeEventListener("abort", cancel);
        resolve(record);
      }
    };
    off = store.subscribe(check);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) {
      cancel();
    } else {
      check(store.get());
    }
  });

export const runExperiment = async (
  dependencies: ExperimentHostDependencies,
  rawRequest: Parameters<PetrinautExperimentHost["createExperiment"]>[0],
  options?: Parameters<PetrinautExperimentHost["createExperiment"]>[1],
): Promise<PetrinautExperimentResult> => {
  const controller = new AbortController();
  const { signal } = controller;
  const cancel = () => controller.abort();
  options?.signal?.addEventListener("abort", cancel, { once: true });
  if (options?.signal?.aborted) {
    cancel();
  }
  const ownership = Promise.withResolvers<void>();
  const requestName = rawRequest.name;
  let searchRuns = 0;
  let experimentId: string | null = null;
  let optimizationId: string | null = null;
  let executionError: string | null = null;
  const getExecutionError = () => executionError;
  let phase: PetrinautExperimentProgress["phase"] = "validating";
  let progressQueued = false;
  let settled = false;
  let lastProgress: PetrinautExperimentProgress | undefined;
  const publishProgress = () => {
    if (progressQueued || settled || !options?.onProgress) {
      return;
    }
    progressQueued = true;
    // Store publication can happen in a host's React effect. Deliver outside
    // that effect so streaming updates do not form a cascading state update.
    queueMicrotask(() => {
      progressQueued = false;
      if (settled) {
        return;
      }
      const experiment = dependencies.experiments
        .get()
        .find((record) => record.id === experimentId);
      if (!experiment) {
        return;
      }
      const study = dependencies.optimizations
        .get()
        .find((record) => record.id === optimizationId);
      const progress: PetrinautExperimentProgress = {
        experimentId: experiment.id,
        name: experiment.name,
        phase,
        runsCompleted:
          experiment.sweep?.runsCompleted ??
          experiment.progress?.completedRuns ??
          0,
        runsTarget: phase === "optimizing" ? searchRuns : experiment.runCount,
        ...(study
          ? {
              step: Math.min(
                study.requestedTrials,
                study.completedTrials +
                  study.prunedTrials +
                  study.failedTrials +
                  1,
              ),
              steps: study.requestedTrials,
            }
          : {}),
      };
      if (
        lastProgress?.experimentId === progress.experimentId &&
        lastProgress.name === progress.name &&
        lastProgress.phase === progress.phase &&
        lastProgress.runsCompleted === progress.runsCompleted &&
        lastProgress.runsTarget === progress.runsTarget &&
        lastProgress.step === progress.step &&
        lastProgress.steps === progress.steps
      ) {
        return;
      }
      lastProgress = progress;
      options.onProgress?.(progress);
    });
  };
  const offExperiments = dependencies.experiments.subscribe(publishProgress);
  const offOptimizations =
    dependencies.optimizations.subscribe(publishProgress);
  const stopCompute = () => {
    if (optimizationId) {
      dependencies.actions.cancelOptimization(optimizationId);
    }
    if (experimentId) {
      dependencies.actions.cancelExperiment(experimentId);
    }
  };
  signal.addEventListener("abort", stopCompute);

  try {
    signal.throwIfAborted();
    const definition = structuredClone(dependencies.definition);
    const extensions = structuredClone(dependencies.extensions);
    const { request, input, fixedValues, optimization } = prepareExperiment(
      rawRequest,
      definition,
      dependencies.title,
    );
    searchRuns =
      request.execution.mode === "optimize"
        ? request.execution.runsPerStep
        : request.runCount;
    await abortable(dependencies.validate(definition, extensions), signal);
    signal.throwIfAborted();
    experimentId = await abortable(
      dependencies.actions.createExperiment(input, {
        definition,
        extensions,
        select: false,
        ownership: {
          signal,
          finished: ownership.promise,
          cancel,
          onError: (message) => {
            executionError = message;
          },
        },
      }),
      signal,
    );
    signal.throwIfAborted();
    phase = optimization ? "optimizing" : "running";
    publishProgress();

    if (optimization && request.execution.mode === "optimize") {
      const experiment = await waitForRecord(
        dependencies.experiments,
        experimentId,
        (record) => record.status !== "initializing",
        signal,
      );
      if (experiment.status === "error" || experiment.status === "cancelled") {
        throw new Error(
          experiment.error ?? "Experiment stopped before optimization started",
        );
      }
      optimizationId = await dependencies.actions.createOptimization(
        optimization,
        {
          sweep: {
            experimentId,
            axes: experiment.parameterAxes,
            metricId: request.execution.objectiveMetricId,
            runCap: request.execution.runsPerStep,
            refineOnSettle: false,
          },
        },
      );
      signal.throwIfAborted();
      const study = await waitForRecord(
        dependencies.optimizations,
        optimizationId,
        (record) =>
          record.status !== "initializing" && record.status !== "running",
        signal,
      );
      if (study.status !== "complete") {
        if (study.status === "cancelled" || study.status === "paused") {
          cancel();
          signal.throwIfAborted();
        }
        throw new Error(study.error ?? "Optimization failed");
      }
      if (!study.best) {
        throw new Error(
          getExecutionError() ??
            "Optimization finished without a finite objective",
        );
      }
      const point = sweepPointFor(
        experiment.parameterAxes,
        study.best.parameters,
      );
      if (!point) {
        throw new Error(
          "The best point does not match the experiment parameters",
        );
      }
      phase = "refining";
      publishProgress();
      const cell = await dependencies.actions.navigateSweep(
        experimentId,
        point,
      );
      signal.throwIfAborted();
      if (!cell || cell.runsCompleted < request.runCount) {
        throw new Error(
          getExecutionError() ??
            "The best point did not finish its requested runs",
        );
      }
      const parameters = { ...fixedValues };
      for (const axis of experiment.parameterAxes) {
        const position = cell.position[axis.identifier];
        if (position === undefined) {
          throw new Error(
            `The best point is missing parameter "${axis.identifier}"`,
          );
        }
        parameters[axis.identifier] = axisValueAt(axis, position);
      }
      return {
        status: "complete",
        experimentId,
        name: request.name,
        runsCompleted: cell.runsCompleted,
        metrics: input.metricSpecs.map((metric) => ({
          id: metric.id,
          label: metric.label,
          value: cell.means[metric.id] ?? null,
        })),
        optimization: {
          parameters,
          objectiveValue:
            cell.means[request.execution.objectiveMetricId] ?? null,
          stepsCompleted:
            study.completedTrials + study.prunedTrials + study.failedTrials,
        },
      };
    }

    const completed = await waitForRecord(
      dependencies.experiments,
      experimentId,
      (record) =>
        record.status === "complete" ||
        record.status === "error" ||
        record.status === "cancelled",
      signal,
    );
    if (completed.status === "cancelled") {
      cancel();
      signal.throwIfAborted();
    }
    if (
      completed.status === "error" ||
      (completed.progress?.erroredRuns ?? 0) > 0
    ) {
      throw new Error(completed.error ?? "Some experiment runs failed");
    }
    return {
      status: "complete",
      experimentId,
      name: request.name,
      runsCompleted: completed.progress?.completedRuns ?? 0,
      metrics: input.metricSpecs.map((metric) => ({
        id: metric.id,
        label: metric.label,
        value: sweepCellObjective(completed.metricFrames, metric.id),
      })),
    };
  } catch (error) {
    const cancelled = signal.aborted;
    stopCompute();
    const record = dependencies.experiments
      .get()
      .find((candidate) => candidate.id === experimentId);
    return {
      status: cancelled ? "cancelled" : "error",
      experimentId,
      name: requestName,
      message: cancelled
        ? "Experiment cancelled"
        : error instanceof Error
          ? error.message
          : String(error),
      runsCompleted:
        record?.sweep?.runsCompleted ?? record?.progress?.completedRuns ?? 0,
      metrics: [],
    };
  } finally {
    settled = true;
    offExperiments();
    offOptimizations();
    signal.removeEventListener("abort", stopCompute);
    options?.signal?.removeEventListener("abort", cancel);
    ownership.resolve();
  }
};
