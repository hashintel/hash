import { use, useEffect, useRef, useState } from "react";
import { v4 as generateUuid } from "uuid";

import {
  createMonteCarloExperiment,
  compileScenario,
  type InitialMarking,
  type MonteCarloExperiment,
  type MonteCarloExperimentState,
  type MonteCarloUserDefinedMetricFrame,
  type MonteCarloWorkerProgress,
  type WorkerFactory,
  type Scenario,
  type ScenarioParameter,
} from "@hashintel/petrinaut-core";
import { createMonteCarloWorker } from "@hashintel/petrinaut-core/workers/monte-carlo";

import { useBlockWindowClose } from "../hooks/use-block-window-close";
import { useLatest } from "../hooks/use-latest";
import { useStableCallback } from "../hooks/use-stable-callback";
import { LanguageClientContext } from "../lsp/context";
import { NotificationsContext } from "../notifications/context";
import { SDCPNContext } from "../state/sdcpn-context";
import {
  type CreateExperimentInput,
  type ExperimentCell,
  type ExperimentRecord,
  type ExperimentStatus,
  ExperimentsContext,
  type ExperimentsContextValue,
  isExperimentActive,
} from "./context";
import {
  buildParameterGridCombinations,
  buildParameterRangeValues,
  MAX_EXPERIMENT_COMBINATIONS,
  type ExperimentParameterAxis,
  type ExperimentParameterInput,
} from "./parameter-grid";

type ExperimentsProviderProps = React.PropsWithChildren<{
  workerFactory?: WorkerFactory;
  /**
   * Cap on cell workers running at once per experiment. Each cell (parameter
   * combination) gets its own Web Worker; defaults to a conservative share of
   * the machine's cores.
   */
  maxConcurrentCellWorkers?: number;
}>;

type CellHandleRegistration = {
  handle: MonteCarloExperiment;
  off: () => void;
};

type PendingExperimentRegistration = {
  abortController: AbortController;
};

/** Per-cell inputs computed by compiling the scenario for one combination. */
type ExperimentCellRuntime = {
  cellIndex: number;
  combination: Record<string, number>;
  parameterValues: Record<string, string>;
  initialMarking: InitialMarking;
};

/**
 * Controls one experiment's grid of cells while it executes. Cell scheduling
 * state (queue position, live handles, in-flight creations) lives in the
 * factory's closure — see `createOrchestration` in the provider.
 */
type ExperimentOrchestration = {
  /** Fills free worker slots with queued cells. */
  launchNextCells: () => void;
  /**
   * Stops scheduling, aborts in-flight worker creations, and asks live
   * workers to cancel gracefully (they confirm with "cancelled" events that
   * carry their final progress).
   */
  stop: () => void;
  /** Hard teardown for remove/unmount: disposes every live worker. */
  dispose: () => void;
};

function getDefaultCellConcurrency(): number {
  const cores = Number(globalThis.navigator.hardwareConcurrency);
  return Math.min(4, Math.max(1, Number.isFinite(cores) ? cores - 2 : 2));
}

function mapExperimentStatus(
  status: MonteCarloExperimentState,
): ExperimentStatus {
  switch (status) {
    case "Initializing":
    case "Ready":
      return "initializing";
    case "Running":
      return "running";
    case "Complete":
      return "complete";
    case "Error":
      return "error";
    case "Cancelled":
      return "cancelled";
  }
}

function isTerminalCellStatus(status: ExperimentCell["status"]): boolean {
  return status === "complete" || status === "error" || status === "cancelled";
}

function deriveExperimentStatus(
  cells: readonly ExperimentCell[],
): ExperimentStatus {
  let anyError = false;
  let anyCancelled = false;
  let anyProgressed = false;
  let allTerminal = true;

  for (const cell of cells) {
    if (cell.status === "error") {
      anyError = true;
    }
    if (cell.status === "cancelled") {
      anyCancelled = true;
    }
    if (
      cell.status === "running" ||
      cell.status === "complete" ||
      cell.status === "cancelled"
    ) {
      anyProgressed = true;
    }
    if (!isTerminalCellStatus(cell.status)) {
      allTerminal = false;
    }
  }

  if (anyError) {
    return "error";
  }
  if (allTerminal) {
    return anyCancelled ? "cancelled" : "complete";
  }
  return anyProgressed ? "running" : "initializing";
}

/**
 * Aggregates the cells' progress into one experiment-level progress. With a
 * single cell the cell's own progress passes through untouched; with a grid,
 * run counters are summed and time/frame become the mean across cells (so
 * the progress bar reflects overall completion).
 */
function aggregateCellProgress(
  cells: readonly ExperimentCell[],
  runCountPerCell: number,
): MonteCarloWorkerProgress | null {
  if (cells.length === 1) {
    return cells[0]!.progress;
  }
  if (cells.every((cell) => cell.progress === null)) {
    return null;
  }

  let activeRuns = 0;
  let advancedRuns = 0;
  let completedRuns = 0;
  let erroredRuns = 0;
  let timeSum = 0;
  let frameSum = 0;
  let allFinished = true;

  for (const cell of cells) {
    activeRuns += cell.progress?.activeRuns ?? 0;
    advancedRuns += cell.progress?.advancedRuns ?? 0;
    completedRuns += cell.progress?.completedRuns ?? 0;
    erroredRuns += cell.progress?.erroredRuns ?? 0;
    timeSum += cell.progress?.time ?? 0;
    frameSum += cell.progress?.frameNumber ?? 0;
    if (!isTerminalCellStatus(cell.status)) {
      allFinished = false;
    }
  }

  return {
    activeRuns,
    advancedRuns,
    completedRuns,
    erroredRuns,
    allFinished,
    frameNumber: Math.round(frameSum / cells.length),
    runCount: runCountPerCell * cells.length,
    time: timeSum / cells.length,
  };
}

function parseScenarioParameterValue(
  parameter: ScenarioParameter,
  rawValue: string | undefined,
): number | string {
  const value =
    rawValue === undefined || rawValue.trim() === ""
      ? String(parameter.default)
      : rawValue.trim();

  if (parameter.type === "boolean") {
    const normalizedValue = value.toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalizedValue)) {
      return 1;
    }
    if (["0", "false", "no", "off"].includes(normalizedValue)) {
      return 0;
    }
    return `${parameter.identifier} must be true or false`;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return `${parameter.identifier} must be a finite number`;
  }
  if (parameter.type === "integer" && !Number.isInteger(parsed)) {
    return `${parameter.identifier} must be an integer`;
  }
  if (parameter.type === "ratio" && (parsed < 0 || parsed > 1)) {
    return `${parameter.identifier} must be between 0 and 1`;
  }

  return parsed;
}

/**
 * Splits the experiment's parameter inputs into fixed values and ranged axes.
 * Single-value ranges collapse into fixed values so they don't create a
 * pointless grid dimension.
 */
function resolveScenarioParameterInputs(
  scenario: Scenario,
  inputs: Record<string, ExperimentParameterInput>,
): {
  fixedValues: Record<string, number>;
  axes: ExperimentParameterAxis[];
  errors: string[];
} {
  const fixedValues: Record<string, number> = {};
  const axes: ExperimentParameterAxis[] = [];
  const errors: string[] = [];

  for (const parameter of scenario.scenarioParameters) {
    const input = inputs[parameter.identifier];

    if (input?.mode === "range") {
      const outcome = buildParameterRangeValues(parameter, input);
      if (!outcome.ok) {
        errors.push(outcome.error);
      } else if (outcome.values.length === 1) {
        fixedValues[parameter.identifier] = outcome.values[0]!;
      } else {
        axes.push({
          identifier: parameter.identifier,
          values: outcome.values,
        });
      }
      continue;
    }

    const parsed = parseScenarioParameterValue(parameter, input?.value);
    if (typeof parsed === "string") {
      errors.push(parsed);
    } else {
      fixedValues[parameter.identifier] = parsed;
    }
  }

  return { fixedValues, axes, errors };
}

function describeCombination(combination: Record<string, number>): string {
  return Object.entries(combination)
    .map(([identifier, value]) => `${identifier}=${value}`)
    .join(", ");
}

function assertExperimentInput(input: CreateExperimentInput): void {
  if (input.name.trim() === "") {
    throw new Error("Experiment name is required");
  }
  if (!Number.isInteger(input.runCount) || input.runCount <= 0) {
    throw new Error("Runs must be a positive integer");
  }
  if (!Number.isInteger(input.seed)) {
    throw new Error("Seed must be an integer");
  }
  if (!Number.isFinite(input.dt) || input.dt <= 0) {
    throw new Error("Time step must be a positive number");
  }
  if (!Number.isFinite(input.maxTime) || input.maxTime <= 0) {
    throw new Error("Max time must be a positive number");
  }
  if (input.metricSpecs.length === 0) {
    throw new Error("Define at least one metric");
  }

  const metricIds = new Set<string>();
  for (const metricSpec of input.metricSpecs) {
    const metricId = metricSpec.id.trim();
    if (metricId === "") {
      throw new Error("Metric id is required");
    }
    if (metricIds.has(metricId)) {
      throw new Error(`Metric id "${metricId}" is duplicated`);
    }
    metricIds.add(metricId);
    if (metricSpec.label.trim() === "") {
      throw new Error("Metric label is required");
    }
    if (metricSpec.kind === "expression" && metricSpec.code.trim() === "") {
      throw new Error(`Metric "${metricSpec.label}" code is required`);
    }
  }
}

export const ExperimentsProvider: React.FC<ExperimentsProviderProps> = ({
  children,
  workerFactory,
  maxConcurrentCellWorkers,
}) => {
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const { requestHirArtifacts } = use(LanguageClientContext);
  const { addNotification } = use(NotificationsContext);
  const petriNetDefinitionRef = useLatest(petriNetDefinition);
  const extensionsRef = useLatest(extensions);
  const workerFactoryRef = useLatest(workerFactory ?? createMonteCarloWorker);
  const cellConcurrencyRef = useLatest(
    maxConcurrentCellWorkers ?? getDefaultCellConcurrency(),
  );
  const orchestrationsRef = useRef(new Map<string, ExperimentOrchestration>());
  const pendingRegistrationsRef = useRef(
    new Map<string, PendingExperimentRegistration>(),
  );
  const [experiments, setExperiments] = useState<ExperimentRecord[]>([]);
  const [selectedExperimentId, setSelectedExperimentId] = useState<
    string | null
  >(null);
  useBlockWindowClose({ shouldBlock: experiments.some(isExperimentActive) });

  useEffect(() => {
    const orchestrations = orchestrationsRef.current;
    const pendingRegistrations = pendingRegistrationsRef.current;
    return () => {
      for (const registration of pendingRegistrations.values()) {
        registration.abortController.abort();
      }
      pendingRegistrations.clear();
      for (const orchestration of orchestrations.values()) {
        orchestration.dispose();
      }
      orchestrations.clear();
    };
  }, []);

  const patchExperiment = (
    experimentId: string,
    patch: Partial<ExperimentRecord>,
  ) => {
    setExperiments((prev) =>
      prev.map((experiment) =>
        experiment.id === experimentId
          ? { ...experiment, ...patch }
          : experiment,
      ),
    );
  };

  /**
   * Applies a per-cell update and re-derives the experiment-level aggregates
   * (status, error, progress, and — for single-cell experiments — the
   * mirrored metric frames) from the updated cells in the same state update.
   */
  const updateExperimentCells = (
    experimentId: string,
    mapCell: (cell: ExperimentCell) => ExperimentCell,
    latestMetricFramesById?: Readonly<
      Record<string, MonteCarloUserDefinedMetricFrame>
    >,
  ) => {
    setExperiments((prev) =>
      prev.map((experiment) => {
        if (experiment.id !== experimentId) {
          return experiment;
        }

        const cells = experiment.cells.map(mapCell);
        const singleCell = cells.length === 1 ? cells[0]! : null;

        return {
          ...experiment,
          cells,
          status: deriveExperimentStatus(cells),
          error:
            experiment.error ??
            cells.find((cell) => cell.error !== null)?.error ??
            null,
          progress: aggregateCellProgress(cells, experiment.runCount),
          ...(singleCell
            ? {
                metricFrames: singleCell.metricFrames,
                latestMetricFramesById:
                  latestMetricFramesById ?? experiment.latestMetricFramesById,
              }
            : {}),
        };
      }),
    );
  };

  const patchExperimentCell = (
    experimentId: string,
    cellIndex: number,
    cellPatch: Partial<ExperimentCell>,
    latestMetricFramesById?: Readonly<
      Record<string, MonteCarloUserDefinedMetricFrame>
    >,
  ) => {
    updateExperimentCells(
      experimentId,
      (cell) => (cell.index === cellIndex ? { ...cell, ...cellPatch } : cell),
      latestMetricFramesById,
    );
  };

  /**
   * Creates the scheduler for one experiment's grid: runs up to
   * `maxConcurrentCellWorkers` cells at once, starting queued cells as slots
   * free up. All mutable scheduling state lives in this closure.
   */
  const createOrchestration = ({
    experimentId,
    experimentName,
    cellRuntimes,
    createCellHandle,
  }: {
    experimentId: string;
    experimentName: string;
    cellRuntimes: readonly ExperimentCellRuntime[];
    createCellHandle: (
      runtime: ExperimentCellRuntime,
      signal: AbortSignal,
    ) => Promise<MonteCarloExperiment>;
  }): ExperimentOrchestration => {
    const registrations = new Map<number, CellHandleRegistration>();
    const creationAborts = new Map<number, AbortController>();
    let nextCellIndex = 0;
    let activeCellCount = 0;
    let completedCellCount = 0;
    let stopScheduling = false;
    let notifiedError = false;

    const maybeCleanup = () => {
      if (
        registrations.size === 0 &&
        creationAborts.size === 0 &&
        (stopScheduling || completedCellCount === cellRuntimes.length)
      ) {
        orchestrationsRef.current.delete(experimentId);
      }
    };

    const notifyError = (message: string) => {
      if (notifiedError) {
        return;
      }
      notifiedError = true;
      addNotification({
        message: `${experimentName} failed: ${message}`,
        tone: "error",
      });
    };

    const stop = () => {
      stopScheduling = true;
      updateExperimentCells(experimentId, (cell) =>
        cell.status === "pending" ? { ...cell, status: "cancelled" } : cell,
      );
      for (const controller of creationAborts.values()) {
        controller.abort();
      }
      creationAborts.clear();
      for (const registration of registrations.values()) {
        registration.handle.cancel();
      }
    };

    const dispose = () => {
      stopScheduling = true;
      for (const controller of creationAborts.values()) {
        controller.abort();
      }
      creationAborts.clear();
      for (const registration of registrations.values()) {
        registration.off();
        registration.handle.dispose();
      }
      registrations.clear();
    };

    const registerCellHandle = (
      cellIndex: number,
      handle: MonteCarloExperiment,
      launchMore: () => void,
    ) => {
      const sync = () => {
        const metricsState = handle.metrics.get();
        patchExperimentCell(
          experimentId,
          cellIndex,
          {
            status: mapExperimentStatus(handle.status.get()),
            progress: handle.progress.get(),
            metricFrames: metricsState.frames,
          },
          metricsState.latestByMetricId,
        );
      };

      const finishCell = () => {
        const registration = registrations.get(cellIndex);
        if (registration) {
          registration.off();
          registration.handle.dispose();
          registrations.delete(cellIndex);
        }
        activeCellCount -= 1;
      };

      const unsubscribeStatus = handle.status.subscribe(sync);
      const unsubscribeProgress = handle.progress.subscribe(sync);
      const unsubscribeMetrics = handle.metrics.subscribe(sync);
      const unsubscribeEvents = handle.events.subscribe((event) => {
        if (event.type === "error") {
          patchExperimentCell(experimentId, cellIndex, {
            status: "error",
            error: event.message,
          });
          notifyError(event.message);
          finishCell();
          // One failed combination invalidates the sweep — stop the rest.
          stop();
          maybeCleanup();
          return;
        }

        sync();

        if (event.type === "complete") {
          completedCellCount += 1;
          finishCell();
          if (completedCellCount === cellRuntimes.length) {
            addNotification({
              message: `${experimentName} complete`,
              tone: "success",
            });
          } else {
            launchMore();
          }
        } else {
          // event.type === "cancelled"
          finishCell();
        }
        maybeCleanup();
      });

      registrations.set(cellIndex, {
        handle,
        off: () => {
          unsubscribeStatus();
          unsubscribeProgress();
          unsubscribeMetrics();
          unsubscribeEvents();
        },
      });
      sync();
    };

    const startCell = (
      runtime: ExperimentCellRuntime,
      launchMore: () => void,
    ) => {
      const { cellIndex } = runtime;
      const abortController = new AbortController();
      creationAborts.set(cellIndex, abortController);
      patchExperimentCell(experimentId, cellIndex, { status: "initializing" });

      const run = async () => {
        try {
          const handle = await createCellHandle(
            runtime,
            abortController.signal,
          );
          creationAborts.delete(cellIndex);

          if (stopScheduling) {
            handle.dispose();
            activeCellCount -= 1;
            patchExperimentCell(experimentId, cellIndex, {
              status: "cancelled",
            });
            maybeCleanup();
            return;
          }

          registerCellHandle(cellIndex, handle, launchMore);
          handle.start();
        } catch (error) {
          creationAborts.delete(cellIndex);
          activeCellCount -= 1;

          if (stopScheduling) {
            // Cancelled or removed while the worker was starting up.
            patchExperimentCell(experimentId, cellIndex, {
              status: "cancelled",
            });
            maybeCleanup();
            return;
          }

          const message =
            error instanceof Error ? error.message : String(error);
          const prefix =
            cellRuntimes.length > 1
              ? `Combination ${describeCombination(runtime.combination)}: `
              : "";
          patchExperimentCell(experimentId, cellIndex, {
            status: "error",
            error: `${prefix}${message}`,
          });
          notifyError(`${prefix}${message}`);
          stop();
          maybeCleanup();
        }
      };

      void run();
    };

    const launchNextCells = () => {
      while (
        !stopScheduling &&
        activeCellCount < cellConcurrencyRef.current &&
        nextCellIndex < cellRuntimes.length
      ) {
        const runtime = cellRuntimes[nextCellIndex]!;
        nextCellIndex += 1;
        activeCellCount += 1;
        startCell(runtime, launchNextCells);
      }
    };

    return { launchNextCells, stop, dispose };
  };

  const createExperiment: ExperimentsContextValue["createExperiment"] = async (
    input,
  ) => {
    assertExperimentInput(input);

    const sdcpn = petriNetDefinitionRef.current;
    const selectedScenario = input.scenarioId
      ? (sdcpn.scenarios ?? []).find(
          (scenario) => scenario.id === input.scenarioId,
        )
      : null;
    if (input.scenarioId && !selectedScenario) {
      throw new Error("Selected scenario does not exist");
    }

    const globalParameters = extensionsRef.current.parameters
      ? sdcpn.parameters
      : [];
    const experimentSdcpn = extensionsRef.current.parameters
      ? sdcpn
      : { ...sdcpn, parameters: [] };

    let parameterAxes: readonly ExperimentParameterAxis[] = [];
    let cellRuntimes: ExperimentCellRuntime[];

    if (selectedScenario) {
      const resolvedInputs = resolveScenarioParameterInputs(
        selectedScenario,
        input.scenarioParameterValues,
      );
      if (resolvedInputs.errors.length > 0) {
        throw new Error(resolvedInputs.errors.join("\n"));
      }
      parameterAxes = resolvedInputs.axes;

      const combinations = buildParameterGridCombinations(parameterAxes);
      if (combinations.length > MAX_EXPERIMENT_COMBINATIONS) {
        throw new Error(
          `This experiment would run ${combinations.length} parameter combinations; the maximum is ${MAX_EXPERIMENT_COMBINATIONS}. Reduce the ranges' value counts.`,
        );
      }

      cellRuntimes = combinations.map((combination, cellIndex) => {
        const compiledScenario = compileScenario(
          selectedScenario,
          globalParameters,
          sdcpn.places,
          sdcpn.types,
          {
            scenarioParameterValues: {
              ...resolvedInputs.fixedValues,
              ...combination,
            },
          },
        );
        if (!compiledScenario.ok) {
          const prefix =
            parameterAxes.length > 0
              ? `Combination ${describeCombination(combination)}: `
              : "";
          throw new Error(
            prefix +
              compiledScenario.errors
                .map(
                  (error) => `${error.source}:${error.itemId} ${error.message}`,
                )
                .join("\n"),
          );
        }

        return {
          cellIndex,
          combination,
          parameterValues: compiledScenario.result.parameterValues,
          initialMarking: compiledScenario.result.initialState,
        };
      });
    } else {
      cellRuntimes = [
        {
          cellIndex: 0,
          combination: {},
          parameterValues: {},
          initialMarking: {},
        },
      ];
    }

    const experimentId = generateUuid();
    const cells: ExperimentCell[] = cellRuntimes.map((runtime) => ({
      index: runtime.cellIndex,
      parameterValues: runtime.combination,
      status: "pending",
      error: null,
      progress: null,
      metricFrames: [],
    }));

    const experiment: ExperimentRecord = {
      id: experimentId,
      name: input.name.trim(),
      createdAt: Date.now(),
      scenarioId: input.scenarioId,
      scenarioName: selectedScenario?.name ?? null,
      runCount: input.runCount,
      seed: input.seed,
      dt: input.dt,
      maxTime: input.maxTime,
      status: "initializing",
      error: null,
      metricSpecs: input.metricSpecs,
      parameterAxes,
      cells,
      progress: null,
      latestMetricFramesById: {},
      metricFrames: [],
    };

    setExperiments((prev) => [experiment, ...prev]);
    setSelectedExperimentId(experimentId);

    const abortController = new AbortController();
    pendingRegistrationsRef.current.set(experimentId, { abortController });

    const initializeExperiment = async () => {
      const experimentExtensions = extensionsRef.current;
      try {
        // Compile the net's user code to HIR artifacts in the language
        // worker — the simulation engine has no compiler of its own. The
        // experiment's expression metrics are compiled alongside by
        // substituting them for the model's metrics. One compile serves
        // every cell: parameter values are runtime inputs, not code.
        const expressionSpecs = input.metricSpecs.filter(
          (spec) => spec.kind === "expression",
        );
        const compiledExperimentSdcpn = {
          ...experimentSdcpn,
          metrics: expressionSpecs.map((spec) => ({
            id: spec.id,
            name: spec.label,
            code: spec.code,
          })),
        };
        const { artifacts, failures } = await requestHirArtifacts(
          compiledExperimentSdcpn,
          experimentExtensions,
        );

        // Compilation cannot currently be aborted. A cancelled or removed
        // experiment must stop here rather than turning a late compile result
        // (or failure below) into workers or an error notification.
        if (!pendingRegistrationsRef.current.has(experimentId)) {
          return;
        }

        const metricSpecs = input.metricSpecs.map((spec) => {
          if (spec.kind !== "expression") {
            return spec;
          }
          const artifact = artifacts.metrics[spec.id];
          if (!artifact) {
            const diagnostics = failures
              .filter(
                (failure) =>
                  failure.itemType === "metric" && failure.itemId === spec.id,
              )
              .flatMap((failure) =>
                failure.diagnostics.map((diagnostic) => diagnostic.message),
              );
            throw new Error(
              `Metric "${spec.label}" did not compile${
                diagnostics.length > 0 ? `: ${diagnostics.join("; ")}` : ""
              }`,
            );
          }
          return { ...spec, artifact };
        });

        const experimentConfigBase = {
          // Artifact fingerprints cover the complete sanitized SDCPN, including
          // its metric definitions. Run the workers against the exact snapshot
          // used above rather than the pre-substitution model.
          sdcpn: compiledExperimentSdcpn,
          extensions: experimentExtensions,
          // The same seed across cells gives every combination the same
          // random-number streams (common random numbers), so differences
          // between cells reflect the parameters rather than sampling noise.
          seed: input.seed,
          dt: input.dt,
          maxTime: input.maxTime,
          hirArtifacts: artifacts,
          runCount: input.runCount,
        };

        const orchestration = createOrchestration({
          experimentId,
          experimentName: experiment.name,
          cellRuntimes,
          createCellHandle: (runtime, signal) =>
            createMonteCarloExperiment({
              ...experimentConfigBase,
              parameterValues: runtime.parameterValues,
              initialMarking: runtime.initialMarking,
              createWorker: workerFactoryRef.current,
              metricSpecs,
              signal,
            }),
        });

        pendingRegistrationsRef.current.delete(experimentId);
        orchestrationsRef.current.set(experimentId, orchestration);
        orchestration.launchNextCells();
      } catch (error) {
        const wasPending = pendingRegistrationsRef.current.delete(experimentId);

        if (!wasPending) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        patchExperiment(experimentId, {
          error: message,
          status: "error",
        });
        addNotification({
          message: `${experiment.name} failed: ${message}`,
          tone: "error",
        });
      }
    };

    void initializeExperiment();

    return experimentId;
  };

  const cancelExperiment: ExperimentsContextValue["cancelExperiment"] = (
    experimentId,
  ) => {
    const pendingRegistration =
      pendingRegistrationsRef.current.get(experimentId);
    if (pendingRegistration) {
      pendingRegistrationsRef.current.delete(experimentId);
      pendingRegistration.abortController.abort();
      setExperiments((prev) =>
        prev.map((experiment) =>
          experiment.id === experimentId
            ? {
                ...experiment,
                status: "cancelled",
                cells: experiment.cells.map((cell) => ({
                  ...cell,
                  status: "cancelled" as const,
                })),
              }
            : experiment,
        ),
      );
      return;
    }

    orchestrationsRef.current.get(experimentId)?.stop();
  };

  const disposeExperimentHandles = (experimentId: string) => {
    const pendingRegistration =
      pendingRegistrationsRef.current.get(experimentId);
    if (pendingRegistration) {
      pendingRegistration.abortController.abort();
      pendingRegistrationsRef.current.delete(experimentId);
    }

    const orchestration = orchestrationsRef.current.get(experimentId);
    if (!orchestration) {
      return;
    }

    orchestration.dispose();
    orchestrationsRef.current.delete(experimentId);
  };

  const removeExperiment: ExperimentsContextValue["removeExperiment"] = (
    experimentId,
  ) => {
    disposeExperimentHandles(experimentId);
    setExperiments((prev) =>
      prev.filter((experiment) => experiment.id !== experimentId),
    );
    setSelectedExperimentId((current) =>
      current === experimentId ? null : current,
    );
  };

  const selectedExperiment =
    experiments.find((experiment) => experiment.id === selectedExperimentId) ??
    null;

  const contextValue: ExperimentsContextValue = {
    experiments,
    selectedExperimentId,
    selectedExperiment,
    setSelectedExperimentId,
    createExperiment: useStableCallback(createExperiment),
    cancelExperiment: useStableCallback(cancelExperiment),
    removeExperiment: useStableCallback(removeExperiment),
  };

  return (
    <ExperimentsContext.Provider value={contextValue}>
      {children}
    </ExperimentsContext.Provider>
  );
};
