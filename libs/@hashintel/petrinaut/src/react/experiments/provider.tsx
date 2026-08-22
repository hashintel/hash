/**
 * @layerRoot react.experiments
 * @role Tracks Monte Carlo experiment handles and their streamed metric results
 */

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
  type ExperimentCellStatus,
  type ExperimentRecord,
  type ExperimentRunFocus,
  type ExperimentStatus,
  ExperimentsContext,
  type ExperimentsContextValue,
  isExperimentActive,
} from "./context";
import {
  buildParameterGridCombinations,
  buildParameterRangeValues,
  getNextRunTarget,
  MAX_EXPERIMENT_COMBINATIONS,
  mergeMetricFramesAcrossCells,
  pickNextRefinementCell,
  type ExperimentParameterAxis,
  type ExperimentParameterInput,
} from "./parameter-grid";

type ExperimentsProviderProps = React.PropsWithChildren<{
  workerFactory?: WorkerFactory;
  /**
   * Cap on cell workers running at once per experiment. Each batch of runs
   * gets its own Web Worker; defaults to a conservative share of the
   * machine's cores.
   */
  maxConcurrentCellWorkers?: number;
  /**
   * How long a parameter selection must stay stable before new refinement
   * batches launch for it. Keeps slider drags from thrashing workers.
   */
  focusDebounceMs?: number;
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

/** Per-batch execution inputs for one cell. */
type CellBatchOptions = {
  runCount: number;
  seed: number;
  signal: AbortSignal;
};

/**
 * Controls one experiment's execution. Scheduling state lives in the
 * factory closures (`createSingleBatchOrchestration` for range-less
 * experiments, `createLazyGridOrchestration` for parameter sweeps).
 */
type ExperimentOrchestration = {
  /** Begins executing (seed pass / first batch). */
  start: () => void;
  /**
   * Tells the scheduler which parameter selection is viewed. Grid
   * experiments refine matching combinations; single-batch experiments
   * ignore this.
   */
  setRunFocus: (focus: ExperimentRunFocus | null) => void;
  /**
   * Permanently stops computing: aborts in-flight worker creations and asks
   * live workers to cancel gracefully (they confirm with "cancelled" events).
   */
  stop: () => void;
  /** Hard teardown for remove/unmount: disposes every live worker. */
  dispose: () => void;
};

const DEFAULT_FOCUS_DEBOUNCE_MS = 250;

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

function deriveExperimentStatus(
  cells: readonly ExperimentCell[],
): ExperimentStatus {
  let anyError = false;
  let anyCancelled = false;
  let anyRunning = false;
  let anyInitializing = false;
  let anyPending = false;
  let anyRuns = false;
  let allComplete = true;

  for (const cell of cells) {
    switch (cell.status) {
      case "error":
        anyError = true;
        break;
      case "cancelled":
        anyCancelled = true;
        break;
      case "running":
        anyRunning = true;
        break;
      case "initializing":
        anyInitializing = true;
        break;
      case "pending":
        anyPending = true;
        break;
      case "idle":
      case "complete":
        break;
    }
    if (cell.runsCompleted > 0) {
      anyRuns = true;
    }
    if (cell.status !== "complete") {
      allComplete = false;
    }
  }

  if (anyError) {
    return "error";
  }
  if (anyRunning) {
    return "running";
  }
  if (anyInitializing) {
    return anyRuns ? "running" : "initializing";
  }
  if (allComplete) {
    return "complete";
  }
  if (anyCancelled) {
    return "cancelled";
  }
  if (anyPending && !anyRuns) {
    return "initializing";
  }
  return "idle";
}

/**
 * Aggregates the cells into one experiment-level progress. With a single
 * cell the cell's own batch progress passes through untouched. With a grid,
 * progress reflects run accumulation: completed runs count accumulated runs
 * plus the live batches, and `time` encodes the accumulated fraction of the
 * total run budget so time-based progress bars stay meaningful.
 */
function aggregateCellProgress(
  cells: readonly ExperimentCell[],
  runCountPerCell: number,
  maxTime: number,
): MonteCarloWorkerProgress | null {
  if (cells.length === 1) {
    return cells[0]!.progress;
  }

  let activeRuns = 0;
  let advancedRuns = 0;
  let completedRuns = 0;
  let erroredRuns = 0;
  let frameNumber = 0;
  let allComplete = true;
  let anyProgress = false;

  for (const cell of cells) {
    if (cell.progress !== null) {
      anyProgress = true;
      activeRuns += cell.progress.activeRuns;
      advancedRuns += cell.progress.advancedRuns;
      erroredRuns += cell.progress.erroredRuns;
      completedRuns += cell.progress.completedRuns;
      frameNumber = Math.max(frameNumber, cell.progress.frameNumber);
    }
    completedRuns += cell.runsCompleted;
    if (cell.runsCompleted > 0) {
      anyProgress = true;
    }
    if (cell.status !== "complete") {
      allComplete = false;
    }
  }

  if (!anyProgress) {
    return null;
  }

  const runCount = runCountPerCell * cells.length;

  return {
    activeRuns,
    advancedRuns,
    completedRuns,
    erroredRuns,
    allFinished: allComplete,
    frameNumber,
    runCount,
    time: runCount > 0 ? maxTime * Math.min(1, completedRuns / runCount) : 0,
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

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
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
  focusDebounceMs,
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
  const focusDebounceRef = useLatest(
    focusDebounceMs ?? DEFAULT_FOCUS_DEBOUNCE_MS,
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
          progress: aggregateCellProgress(
            cells,
            experiment.runCount,
            experiment.maxTime,
          ),
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
   * Range-less experiments: one full batch of `runCount` runs, computed
   * eagerly in the background exactly as before parameter sweeps existed.
   */
  const createSingleBatchOrchestration = ({
    experimentId,
    experimentName,
    runtime,
    runCount,
    seed,
    createCellHandle,
  }: {
    experimentId: string;
    experimentName: string;
    runtime: ExperimentCellRuntime;
    runCount: number;
    seed: number;
    createCellHandle: (
      cellRuntime: ExperimentCellRuntime,
      options: CellBatchOptions,
    ) => Promise<MonteCarloExperiment>;
  }): ExperimentOrchestration => {
    const { cellIndex } = runtime;
    let registration: CellHandleRegistration | null = null;
    let creationAbort: AbortController | null = null;
    let stopScheduling = false;
    let notifiedError = false;

    const maybeCleanup = () => {
      if (registration === null && creationAbort === null) {
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

    const finishCell = () => {
      if (registration) {
        registration.off();
        registration.handle.dispose();
        registration = null;
      }
    };

    const registerHandle = (handle: MonteCarloExperiment) => {
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
          maybeCleanup();
          return;
        }

        sync();

        if (event.type === "complete") {
          patchExperimentCell(experimentId, cellIndex, {
            runsCompleted: runCount,
          });
          addNotification({
            message: `${experimentName} complete`,
            tone: "success",
          });
        }
        finishCell();
        maybeCleanup();
      });

      registration = {
        handle,
        off: () => {
          unsubscribeStatus();
          unsubscribeProgress();
          unsubscribeMetrics();
          unsubscribeEvents();
        },
      };
      sync();
    };

    const start = () => {
      const abortController = new AbortController();
      creationAbort = abortController;
      patchExperimentCell(experimentId, cellIndex, { status: "initializing" });

      const run = async () => {
        try {
          const handle = await createCellHandle(runtime, {
            runCount,
            seed,
            signal: abortController.signal,
          });
          creationAbort = null;

          if (stopScheduling) {
            handle.dispose();
            patchExperimentCell(experimentId, cellIndex, {
              status: "cancelled",
            });
            maybeCleanup();
            return;
          }

          registerHandle(handle);
          handle.start();
        } catch (error) {
          creationAbort = null;

          if (stopScheduling || isAbortError(error)) {
            // Cancelled or removed while the worker was starting up.
            patchExperimentCell(experimentId, cellIndex, {
              status: "cancelled",
            });
            maybeCleanup();
            return;
          }

          const message =
            error instanceof Error ? error.message : String(error);
          patchExperimentCell(experimentId, cellIndex, {
            status: "error",
            error: message,
          });
          notifyError(message);
          maybeCleanup();
        }
      };

      void run();
    };

    const stop = () => {
      stopScheduling = true;
      creationAbort?.abort();
      creationAbort = null;
      registration?.handle.cancel();
    };

    const dispose = () => {
      stopScheduling = true;
      creationAbort?.abort();
      creationAbort = null;
      finishCell();
    };

    return { start, setRunFocus: () => {}, stop, dispose };
  };

  /**
   * Parameter sweeps: lazily computed, view-driven. First a seed pass gives
   * every combination a single run (a cheap overview of the whole space).
   * After that, compute follows the viewed selection: matching combinations
   * are refined in progressively larger batches (1 → 10 → 50 → 100 → 500 →
   * 1000 …) up to the requested run count, always levelling up the
   * combinations with the fewest runs first (random among ties, so unpinned
   * values are sampled randomly). Changing the selection interrupts batches
   * that left the view (their partial runs are discarded) and redirects the
   * workers; closing the results view pauses refinement entirely.
   */
  const createLazyGridOrchestration = ({
    experimentId,
    experimentName,
    cellRuntimes,
    axes,
    runCount,
    seed,
    createCellHandle,
  }: {
    experimentId: string;
    experimentName: string;
    cellRuntimes: readonly ExperimentCellRuntime[];
    axes: readonly ExperimentParameterAxis[];
    runCount: number;
    seed: number;
    createCellHandle: (
      cellRuntime: ExperimentCellRuntime,
      options: CellBatchOptions,
    ) => Promise<MonteCarloExperiment>;
  }): ExperimentOrchestration => {
    const runtimeByCellIndex = new Map(
      cellRuntimes.map((runtime) => [runtime.cellIndex, runtime]),
    );
    const registrations = new Map<number, CellHandleRegistration>();
    const creationAborts = new Map<number, AbortController>();
    /** Cells with a batch computing (worker starting or live). */
    const inFlightBatches = new Set<number>();
    /** Authoritative accumulation state, mirrored into the React cells. */
    const accumulatedFrames = new Map<
      number,
      readonly MonteCarloUserDefinedMetricFrame[]
    >();
    const completedRuns = new Map<number, number>();
    const seedQueue = cellRuntimes.map((runtime) => runtime.cellIndex);
    let focus: ExperimentRunFocus | null = null;
    let focusTimer: ReturnType<typeof setTimeout> | null = null;
    let stopScheduling = false;
    let notifiedError = false;
    let notifiedComplete = false;

    const runsOf = (cellIndex: number) => completedRuns.get(cellIndex) ?? 0;

    const isSaturated = (cellIndex: number) => runsOf(cellIndex) >= runCount;

    const allSaturated = () =>
      cellRuntimes.every((runtime) => isSaturated(runtime.cellIndex));

    /** The cell's resting status when no batch is computing for it. */
    const restingStatus = (cellIndex: number): ExperimentCellStatus => {
      if (stopScheduling) {
        return "cancelled";
      }
      if (isSaturated(cellIndex)) {
        return "complete";
      }
      return runsOf(cellIndex) > 0 ? "idle" : "pending";
    };

    const focusMatchesCell = (cellIndex: number): boolean => {
      if (focus === null) {
        return false;
      }
      const runtime = runtimeByCellIndex.get(cellIndex)!;
      return axes.every((axis) => {
        const pinnedIndex = focus![axis.identifier] ?? null;
        return (
          pinnedIndex === null ||
          runtime.combination[axis.identifier] === axis.values[pinnedIndex]
        );
      });
    };

    const maybeCleanup = () => {
      if (
        (stopScheduling || allSaturated()) &&
        registrations.size === 0 &&
        creationAborts.size === 0 &&
        inFlightBatches.size === 0
      ) {
        if (focusTimer !== null) {
          clearTimeout(focusTimer);
          focusTimer = null;
        }
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

    const finishBatchRegistration = (cellIndex: number) => {
      const registration = registrations.get(cellIndex);
      if (registration) {
        registration.off();
        registration.handle.dispose();
        registrations.delete(cellIndex);
      }
      inFlightBatches.delete(cellIndex);
    };

    /**
     * Interrupts the cell's in-flight batch (its partial runs are
     * discarded); accumulated results are untouched.
     */
    const interruptBatch = (cellIndex: number) => {
      const creation = creationAborts.get(cellIndex);
      if (creation) {
        // The abort rejection handler in startBatch resets the cell.
        creation.abort();
        creationAborts.delete(cellIndex);
        return;
      }
      // The "cancelled" event handler resets the cell.
      registrations.get(cellIndex)?.handle.cancel();
    };

    const registerBatchHandle = (
      cellIndex: number,
      batchRuns: number,
      handle: MonteCarloExperiment,
      onSettled: () => void,
    ) => {
      const sync = () => {
        patchExperimentCell(experimentId, cellIndex, {
          status:
            mapExperimentStatus(handle.status.get()) === "running"
              ? "running"
              : "initializing",
          progress: handle.progress.get(),
          inFlightMetricFrames: handle.metrics.get().frames,
        });
      };

      const unsubscribeStatus = handle.status.subscribe(sync);
      const unsubscribeProgress = handle.progress.subscribe(sync);
      const unsubscribeMetrics = handle.metrics.subscribe(sync);
      const unsubscribeEvents = handle.events.subscribe((event) => {
        if (event.type === "error") {
          patchExperimentCell(experimentId, cellIndex, {
            status: "error",
            error: event.message,
            inFlightMetricFrames: [],
            progress: null,
          });
          notifyError(event.message);
          finishBatchRegistration(cellIndex);
          // One failed combination invalidates the sweep — stop the rest.
          stopScheduling = true;
          for (const controller of creationAborts.values()) {
            controller.abort();
          }
          creationAborts.clear();
          for (const remaining of registrations.values()) {
            remaining.handle.cancel();
          }
          maybeCleanup();
          return;
        }

        if (event.type === "complete") {
          const batchFrames = handle.metrics.get().frames;
          const previousFrames = accumulatedFrames.get(cellIndex) ?? [];
          const mergedFrames =
            previousFrames.length > 0
              ? mergeMetricFramesAcrossCells([previousFrames, batchFrames])
              : [...batchFrames];
          accumulatedFrames.set(cellIndex, mergedFrames);
          completedRuns.set(cellIndex, runsOf(cellIndex) + batchRuns);
          finishBatchRegistration(cellIndex);
          patchExperimentCell(experimentId, cellIndex, {
            status: restingStatus(cellIndex),
            runsCompleted: runsOf(cellIndex),
            metricFrames: mergedFrames,
            inFlightMetricFrames: [],
            progress: null,
          });
          if (!notifiedComplete && allSaturated()) {
            notifiedComplete = true;
            addNotification({
              message: `${experimentName} complete`,
              tone: "success",
            });
          }
          onSettled();
          maybeCleanup();
          return;
        }

        // event.type === "cancelled" — interrupted batch, partial discarded.
        finishBatchRegistration(cellIndex);
        patchExperimentCell(experimentId, cellIndex, {
          status: restingStatus(cellIndex),
          inFlightMetricFrames: [],
          progress: null,
        });
        onSettled();
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

    const startBatch = (
      cellIndex: number,
      targetRuns: number,
      onSettled: () => void,
    ) => {
      const runtime = runtimeByCellIndex.get(cellIndex)!;
      const runsBefore = runsOf(cellIndex);
      const batchRuns = targetRuns - runsBefore;
      const abortController = new AbortController();
      creationAborts.set(cellIndex, abortController);
      inFlightBatches.add(cellIndex);
      patchExperimentCell(experimentId, cellIndex, { status: "initializing" });

      const run = async () => {
        try {
          const handle = await createCellHandle(runtime, {
            runCount: batchRuns,
            // Offsetting the base seed by the accumulated run count keeps
            // batch RNG streams distinct while cells at the same progress
            // stay paired (common random numbers).
            seed: seed + runsBefore,
            signal: abortController.signal,
          });
          creationAborts.delete(cellIndex);

          if (stopScheduling) {
            handle.dispose();
            inFlightBatches.delete(cellIndex);
            patchExperimentCell(experimentId, cellIndex, {
              status: restingStatus(cellIndex),
            });
            maybeCleanup();
            return;
          }

          registerBatchHandle(cellIndex, batchRuns, handle, onSettled);
          handle.start();
        } catch (error) {
          creationAborts.delete(cellIndex);
          inFlightBatches.delete(cellIndex);

          if (stopScheduling || isAbortError(error)) {
            // Interrupted (focus change, cancel, or removal) while the
            // worker was starting up.
            patchExperimentCell(experimentId, cellIndex, {
              status: restingStatus(cellIndex),
            });
            onSettled();
            maybeCleanup();
            return;
          }

          const message =
            error instanceof Error ? error.message : String(error);
          const prefixed = `Combination ${describeCombination(runtime.combination)}: ${message}`;
          patchExperimentCell(experimentId, cellIndex, {
            status: "error",
            error: prefixed,
          });
          notifyError(prefixed);
          stopScheduling = true;
          maybeCleanup();
        }
      };

      void run();
    };

    /** Fills free worker slots: seed pass first, then focused refinement. */
    const scheduleMore = () => {
      if (stopScheduling) {
        return;
      }

      // Seed pass: one run for every combination, regardless of focus.
      while (
        inFlightBatches.size < cellConcurrencyRef.current &&
        seedQueue.length > 0
      ) {
        const cellIndex = seedQueue.shift()!;
        const target = getNextRunTarget(0, runCount);
        if (target === null) {
          continue;
        }
        startBatch(cellIndex, target, scheduleMore);
      }

      // Refinement: level up the viewed combinations with the fewest runs.
      while (inFlightBatches.size < cellConcurrencyRef.current) {
        const candidates = cellRuntimes
          .filter(
            (runtime) =>
              !inFlightBatches.has(runtime.cellIndex) &&
              runsOf(runtime.cellIndex) > 0 &&
              !isSaturated(runtime.cellIndex) &&
              focusMatchesCell(runtime.cellIndex),
          )
          .map((runtime) => ({
            cellIndex: runtime.cellIndex,
            completedRuns: runsOf(runtime.cellIndex),
          }));
        const picked = pickNextRefinementCell(candidates);
        if (picked === null) {
          break;
        }
        const target = getNextRunTarget(runsOf(picked), runCount);
        if (target === null) {
          break;
        }
        startBatch(picked, target, scheduleMore);
      }
    };

    const setRunFocus = (nextFocus: ExperimentRunFocus | null) => {
      if (stopScheduling) {
        return;
      }
      focus = nextFocus;

      // Immediately stop refining combinations that left the view. Seed-pass
      // batches (cells without any completed run) always finish: they are
      // single runs and form the baseline overview. Interruption settles
      // asynchronously (abort rejection / "cancelled" event), so the set is
      // not mutated while iterating.
      for (const cellIndex of inFlightBatches) {
        if (runsOf(cellIndex) === 0 || focusMatchesCell(cellIndex)) {
          continue;
        }
        interruptBatch(cellIndex);
      }

      // Debounce launches so slider drags don't thrash workers.
      if (focusTimer !== null) {
        clearTimeout(focusTimer);
        focusTimer = null;
      }
      const debounceMs = focusDebounceRef.current;
      if (debounceMs <= 0) {
        scheduleMore();
      } else {
        focusTimer = setTimeout(() => {
          focusTimer = null;
          scheduleMore();
        }, debounceMs);
      }
    };

    const stop = () => {
      stopScheduling = true;
      if (focusTimer !== null) {
        clearTimeout(focusTimer);
        focusTimer = null;
      }
      updateExperimentCells(experimentId, (cell) =>
        cell.status === "complete" || cell.status === "error"
          ? cell
          : { ...cell, status: "cancelled", inFlightMetricFrames: [] },
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
      if (focusTimer !== null) {
        clearTimeout(focusTimer);
        focusTimer = null;
      }
      for (const controller of creationAborts.values()) {
        controller.abort();
      }
      creationAborts.clear();
      for (const registration of registrations.values()) {
        registration.off();
        registration.handle.dispose();
      }
      registrations.clear();
      inFlightBatches.clear();
    };

    return { start: scheduleMore, setRunFocus, stop, dispose };
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
      runsCompleted: 0,
      metricFrames: [],
      inFlightMetricFrames: [],
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
        // every cell and batch: parameter values are runtime inputs, not
        // code.
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
          // Artifact fingerprints cover the complete sanitized SDCPN,
          // including its metric definitions. Run the workers against the
          // exact snapshot used above rather than the pre-substitution model.
          sdcpn: compiledExperimentSdcpn,
          extensions: experimentExtensions,
          dt: input.dt,
          maxTime: input.maxTime,
          hirArtifacts: artifacts,
        };

        const createCellHandle = (
          cellRuntime: ExperimentCellRuntime,
          options: CellBatchOptions,
        ) =>
          createMonteCarloExperiment({
            ...experimentConfigBase,
            parameterValues: cellRuntime.parameterValues,
            initialMarking: cellRuntime.initialMarking,
            createWorker: workerFactoryRef.current,
            metricSpecs,
            runCount: options.runCount,
            seed: options.seed,
            signal: options.signal,
          });

        const orchestration =
          cellRuntimes.length === 1
            ? createSingleBatchOrchestration({
                experimentId,
                experimentName: experiment.name,
                runtime: cellRuntimes[0]!,
                runCount: input.runCount,
                seed: input.seed,
                createCellHandle,
              })
            : createLazyGridOrchestration({
                experimentId,
                experimentName: experiment.name,
                cellRuntimes,
                axes: parameterAxes,
                runCount: input.runCount,
                seed: input.seed,
                createCellHandle,
              });

        pendingRegistrationsRef.current.delete(experimentId);
        orchestrationsRef.current.set(experimentId, orchestration);
        orchestration.start();
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

  const setExperimentRunFocus: ExperimentsContextValue["setExperimentRunFocus"] =
    (experimentId, focus) => {
      orchestrationsRef.current.get(experimentId)?.setRunFocus(focus);
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
    setExperimentRunFocus: useStableCallback(setExperimentRunFocus),
  };

  return (
    <ExperimentsContext.Provider value={contextValue}>
      {children}
    </ExperimentsContext.Provider>
  );
};
