/**
 * @layerRoot react.experiments
 * @role Tracks Monte Carlo experiment handles and their streamed metric results
 */

import { use, useEffect, useRef, useState } from "react";
import { v4 as generateUuid } from "uuid";

import {
  type MonteCarloExperiment,
  getDefaultMonteCarloShardCount,
  type WorkerFactory,
} from "@hashintel/petrinaut-core";
import {
  createReusableWorkerFactory,
  type ExperimentBackendRegistration,
  selectExperimentBackend,
  type ExperimentBackend,
  type ReusableWorkerFactory,
} from "@hashintel/petrinaut-core/experiments";
import { createMonteCarloWorker } from "@hashintel/petrinaut-core/workers/monte-carlo";

import { useBlockWindowClose } from "../hooks/use-block-window-close";
import { useLatest } from "../hooks/use-latest";
import { useStableCallback } from "../hooks/use-stable-callback";
import { LanguageClientContext } from "../lsp/context";
import {
  openPetrinautSimulationResource,
  usePetrinautNavigation,
} from "../navigation";
import { NotificationsContext } from "../notifications/context";
import { SDCPNContext } from "../state/sdcpn-context";
import {
  type ExperimentComputeBackend,
  type ExperimentRecord,
  ExperimentsActionsContext,
  type ExperimentsActionsValue,
  ExperimentsContext,
  type ExperimentsContextValue,
  isExperimentActive,
  isTerminalExperimentStatus,
} from "./context";
import {
  assertExperimentInput,
  buildSweepAxes,
  compileExperimentScenario,
  createExperimentRequestBuilder,
  experimentBackendRegistrations,
  experimentSdcpnWithMetrics,
  newExperimentRecord,
} from "./provider/create-experiment";
import {
  createDetachedObjectiveSampler,
  type DetachedObjectiveSampler,
} from "./provider/detached-objective";
import {
  latestFramesById,
  mapExperimentStatus,
  patchExperimentRecords,
} from "./provider/experiment-records";
import { createSweepBatchInstantiator } from "./provider/sweep-batch-instantiation";
import { createSweepSession, type SweepSession } from "./sweep-session";

import type { ExperimentParameterAxis } from "./parameter-grid";
import type {
  BuildExperimentRequest,
  SweptScenarioCompiler,
} from "./provider/shared/experiment-request";

export { buildSweepAxes } from "./provider/create-experiment";

type ExperimentsProviderProps = React.PropsWithChildren<{
  workerFactory?: WorkerFactory;
  /**
   * How many workers each experiment splits its runs across.
   *
   * Defaults to one per logical core minus one. Sharding never changes an
   * experiment's results, only how quickly it finishes, so this exists for hosts
   * that need to cap CPU use (or pin behaviour in tests) rather than to affect
   * output.
   */
  experimentShardCount?: number;
}>;

type ExperimentHandleRegistration = {
  handle: MonteCarloExperiment;
  off: () => void;
};

type PendingExperimentRegistration = {
  abortController: AbortController;
};

export const ExperimentsProvider: React.FC<ExperimentsProviderProps> = ({
  children,
  workerFactory,
  experimentShardCount,
}) => {
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const languageClient = use(LanguageClientContext);
  const { addNotification } = use(NotificationsContext);
  const navigation = usePetrinautNavigation();
  const petriNetDefinitionRef = useLatest(petriNetDefinition);
  const extensionsRef = useLatest(extensions);
  const languageClientRef = useLatest(languageClient);
  const workerFactoryRef = useLatest(workerFactory ?? createMonteCarloWorker);
  const shardCountRef = useLatest(experimentShardCount);
  // One worker pool per provider: batches lease workers instead of spawning
  // and killing a pool's worth per ladder rung and per surface cell. The
  // base factory is read at call time, so an injected factory stays live;
  // changing it drains the old pool below.
  const reusableWorkerFactoryRef = useRef<ReusableWorkerFactory | null>(null);
  reusableWorkerFactoryRef.current ??= createReusableWorkerFactory(
    () => workerFactoryRef.current(),
    {
      // A sweep commit releases the whole working set at once: TWO sharded
      // foreground batches (the ladder pipelines its rungs) plus the surface
      // lanes. The pool must hold that set or every commit terminates the
      // overflow and respawns it a moment later.
      maxIdle:
        2 * (experimentShardCount ?? getDefaultMonteCarloShardCount()) + 8,
    },
  );
  const reusableWorkerFactory = reusableWorkerFactoryRef.current;
  // Factory change: flush pooled workers built from the old base factory
  // (leases in flight finish on it and re-pool; the next lease is fresh).
  useEffect(() => {
    const pool = reusableWorkerFactoryRef.current;
    return () => {
      pool?.drain();
    };
  }, [workerFactory]);
  // Unmount: shut the pool for good. Handles released by later cleanups (and
  // in-flight leases finishing afterwards) must terminate their workers
  // rather than pool them where nothing will ever lease or drain again.
  useEffect(() => {
    const pool = reusableWorkerFactoryRef.current;
    return () => {
      pool?.dispose();
    };
  }, []);
  const registrationsRef = useRef(
    new Map<string, ExperimentHandleRegistration>(),
  );
  const pendingRegistrationsRef = useRef(
    new Map<string, PendingExperimentRegistration>(),
  );
  const sweepSessionsRef = useRef(new Map<string, SweepSession>());
  /** Backends an experiment chose, disposed with the experiment. */
  const backendsRef = useRef(new Map<string, ExperimentBackend[]>());
  const detachedObjectiveSamplerRef = useRef<DetachedObjectiveSampler | null>(
    null,
  );
  const [experiments, setExperiments] = useState<ExperimentRecord[]>([]);
  const selectedExperimentId =
    navigation.state.simulateResource?.type === "experiment"
      ? navigation.state.simulateResource.id
      : null;
  const setSelectedExperimentId: ExperimentsContextValue["setSelectedExperimentId"] =
    (experimentId) => {
      navigation.navigate(
        experimentId
          ? openPetrinautSimulationResource({
              type: "experiment",
              id: experimentId,
            })
          : { simulateResource: null },
        { cause: "user", action: "simulation-resource" },
      );
    };
  useBlockWindowClose({ shouldBlock: experiments.some(isExperimentActive) });

  useEffect(() => {
    const registrations = registrationsRef.current;
    const pendingRegistrations = pendingRegistrationsRef.current;
    const sweepSessions = sweepSessionsRef.current;
    const chosenBackends = backendsRef.current;
    const detachedObjectiveSampler = detachedObjectiveSamplerRef;
    return () => {
      detachedObjectiveSampler.current?.dispose();
      detachedObjectiveSampler.current = null;
      for (const registration of pendingRegistrations.values()) {
        registration.abortController.abort();
      }
      pendingRegistrations.clear();
      for (const registration of registrations.values()) {
        registration.off();
        registration.handle.dispose();
      }
      registrations.clear();
      for (const session of sweepSessions.values()) {
        session.dispose();
      }
      sweepSessions.clear();
      for (const backends of chosenBackends.values()) {
        for (const backend of backends) {
          backend.dispose?.();
        }
      }
      chosenBackends.clear();
    };
  }, []);

  useEffect(() => {
    if (
      selectedExperimentId &&
      !experiments.some(({ id }) => id === selectedExperimentId)
    ) {
      navigation.navigate(
        { simulateResource: null },
        { cause: "normalization", action: "simulation-resource" },
      );
    }
  }, [experiments, navigation, selectedExperimentId]);

  const patchExperiment = (
    experimentId: string,
    patch: Partial<ExperimentRecord>,
  ) => {
    // Stamped here rather than at each call site, so no path — completion, a
    // worker error, cancellation — can finish an experiment without
    // recording when it stopped.
    const finishedAt =
      patch.status !== undefined && isTerminalExperimentStatus(patch.status)
        ? Date.now()
        : null;
    setExperiments((prev) =>
      patchExperimentRecords(prev, experimentId, patch, finishedAt),
    );
  };

  const rememberBackend = (
    experimentId: string,
    backend: ExperimentBackend,
  ) => {
    const backends = backendsRef.current.get(experimentId) ?? [];
    backends.push(backend);
    backendsRef.current.set(experimentId, backends);
  };

  const disposeBackends = (experimentId: string) => {
    for (const backend of backendsRef.current.get(experimentId) ?? []) {
      backend.dispose?.();
    }
    backendsRef.current.delete(experimentId);
  };

  const disposeExperimentHandle = (experimentId: string) => {
    const pendingRegistration =
      pendingRegistrationsRef.current.get(experimentId);
    if (pendingRegistration) {
      pendingRegistration.abortController.abort();
      pendingRegistrationsRef.current.delete(experimentId);
    }

    const registration = registrationsRef.current.get(experimentId);
    if (!registration) {
      return;
    }

    registration.off();
    registration.handle.dispose();
    registrationsRef.current.delete(experimentId);
    disposeBackends(experimentId);
  };

  const disposeSweepSession = (experimentId: string) => {
    sweepSessionsRef.current.get(experimentId)?.dispose();
    sweepSessionsRef.current.delete(experimentId);
    disposeBackends(experimentId);
  };

  const registerExperimentHandle = (
    experiment: ExperimentRecord,
    handle: MonteCarloExperiment,
  ) => {
    const { id: experimentId, name: experimentName } = experiment;

    const sync = () => {
      patchExperiment(experimentId, {
        latestMetricFramesById: handle.metrics.get().latestByMetricId,
        metricFrames: handle.metrics.get().frames,
        progress: handle.progress.get(),
        status: mapExperimentStatus(handle.status.get()),
      });
    };

    const unsubscribeStatus = handle.status.subscribe(sync);
    const unsubscribeProgress = handle.progress.subscribe(sync);
    const unsubscribeMetrics = handle.metrics.subscribe(sync);
    const unsubscribeEvents = handle.events.subscribe((event) => {
      if (event.type === "error") {
        patchExperiment(experimentId, {
          error: event.message,
          status: "error",
        });
        addNotification({
          message: `${experimentName} failed: ${event.message}`,
          tone: "error",
        });
      } else {
        sync();
      }

      if (event.type === "complete") {
        addNotification({
          message: `${experimentName} complete`,
          tone: "success",
        });
      }

      // Every event is terminal, so any event means the handle is finished
      // with. Disposal releases the backend's resources — for the GPU path,
      // `device.destroy()`.
      disposeExperimentHandle(experimentId);
    });

    registrationsRef.current.set(experimentId, {
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

  /**
   * Starts the progressive compute session behind a sweep experiment and
   * mirrors its stream into the record.
   */
  const startSweepSession = ({
    experiment,
    axes,
    registrations,
    buildRequest,
    compiler,
    netParameterVariableNames,
    onNote,
  }: {
    experiment: ExperimentRecord;
    axes: readonly ExperimentParameterAxis[];
    registrations: readonly ExperimentBackendRegistration[];
    buildRequest: BuildExperimentRequest;
    compiler: SweptScenarioCompiler;
    netParameterVariableNames: ReadonlySet<string>;
    onNote: (note: { message: string }) => void;
  }) => {
    const experimentId = experiment.id;
    const session = createSweepSession({
      axes,
      runCount: experiment.runCount,
      seed: experiment.seed,
      // Leading-edge, so the first frames publish instantly; while a
      // batch streams, ~10 re-renders a second read as live on a chart
      // and leave the rest of the UI most of each frame's budget.
      publishThrottleMs: 100,
      instantiateBatch: createSweepBatchInstantiator({
        registrations,
        buildRequest,
        compiler,
        netParameterVariableNames,
        createWorker: reusableWorkerFactory,
        shardCount: shardCountRef.current ?? getDefaultMonteCarloShardCount(),
        onBackendChosen: (selection) => {
          rememberBackend(experimentId, selection.backend);
          const [firstDeclined] = selection.declined;
          if (firstDeclined) {
            addNotification({
              message: `${experiment.name} is running on the CPU: ${firstDeclined.reason}`,
              tone: "neutral",
            });
          }
          patchExperiment(experimentId, {
            computeBackend: selection.backendId as ExperimentComputeBackend,
            computeBackendFallbackReason: firstDeclined?.reason ?? null,
            startedAt: Date.now(),
          });
        },
        onNote,
      }),
      initialMarkingKey: (values) => {
        try {
          return JSON.stringify(
            compiler.compileForValues(values).result.initialState,
          );
        } catch {
          return null;
        }
      },
      onUpdate: (update) => {
        patchExperiment(experimentId, {
          status: update.failed
            ? "error"
            : update.computing
              ? "running"
              : "idle",
          metricFrames: update.metricFrames,
          latestMetricFramesById: latestFramesById(update.metricFrames),
          progress: update.progress,
          sweep: {
            selection: update.selection,
            runsCompleted: update.runsCompleted,
            runsSampled: update.runsSampled,
            runTarget: update.runTarget,
            computing: update.computing,
          },
        });
      },
      onBatches: (sweepBatches) => {
        patchExperiment(experimentId, { sweepBatches });
      },
      onError: (message) => {
        patchExperiment(experimentId, {
          error: message,
          status: "error",
        });
        addNotification({
          message: `${experiment.name} failed: ${message}`,
          tone: "error",
        });
      },
    });
    sweepSessionsRef.current.set(experimentId, session);
  };

  const createExperiment: ExperimentsContextValue["createExperiment"] = async (
    input,
  ) => {
    assertExperimentInput(input);

    const sdcpn = petriNetDefinitionRef.current;
    const experimentExtensions = extensionsRef.current;
    const scenario = input.scenarioId
      ? ((sdcpn.scenarios ?? []).find(({ id }) => id === input.scenarioId) ??
        null)
      : null;
    if (input.scenarioId && !scenario) {
      throw new Error("Selected scenario does not exist");
    }

    const { fixedValues, axes } = buildSweepAxes(
      scenario,
      input.scenarioParameterValues,
    );
    const experimentSdcpn = experimentExtensions.parameters
      ? sdcpn
      : { ...sdcpn, parameters: [] };
    const compiled = await compileExperimentScenario({
      input,
      scenario,
      fixedValues,
      axes,
      sdcpn: experimentSdcpn,
      requestScenarioHir: languageClientRef.current.requestScenarioHir,
    });

    const experimentId = generateUuid();
    const experiment = newExperimentRecord({
      id: experimentId,
      input,
      scenarioName:
        scenario?.name ?? (input.adHocScenario ? "Ad-hoc scenario" : null),
      axes,
    });
    setExperiments((prev) => [experiment, ...prev]);
    setSelectedExperimentId(experimentId);

    const abortController = new AbortController();
    pendingRegistrationsRef.current.set(experimentId, { abortController });

    const initializeExperiment = async () => {
      try {
        // Run against the exact snapshot the artifacts are compiled from:
        // their fingerprints cover the complete SDCPN, metrics included.
        const compiledExperimentSdcpn = experimentSdcpnWithMetrics(
          experimentSdcpn,
          input.metricSpecs,
        );
        const buildRequest = createExperimentRequestBuilder({
          input,
          sdcpn: compiledExperimentSdcpn,
          extensions: experimentExtensions,
          compiled,
          requestHirArtifacts: languageClientRef.current.requestHirArtifacts,
        });
        const registrations = experimentBackendRegistrations({
          computeBackend: input.computeBackend,
          createWorker: reusableWorkerFactory,
          shardCount: shardCountRef.current,
        });
        const onNote = (note: { message: string }) => {
          addNotification({
            message: `${experiment.name}: ${note.message}`,
            tone: "error",
          });
        };

        if (axes.length > 0 && compiled.sweptCompiler) {
          startSweepSession({
            experiment,
            axes,
            registrations,
            buildRequest,
            compiler: compiled.sweptCompiler,
            netParameterVariableNames: new Set(
              compiledExperimentSdcpn.parameters.map(
                (parameter) => parameter.variableName,
              ),
            ),
            onNote,
          });
          pendingRegistrationsRef.current.delete(experimentId);
          return;
        }

        const selection = await selectExperimentBackend({
          registrations,
          buildRequest,
          instantiateOptions: { signal: abortController.signal, onNote },
        });

        // Compilation and device acquisition cannot be aborted mid-flight. A
        // cancelled or removed experiment must stop here rather than turning a
        // late result into a running handle.
        if (!pendingRegistrationsRef.current.has(experimentId)) {
          if (selection.ok) {
            selection.handle.dispose();
          }
          return;
        }

        if (!selection.ok) {
          throw new Error(
            selection.declined
              .map((entry) => `${entry.backendId}: ${entry.reason}`)
              .join("; ") || "No compute backend could run this experiment.",
          );
        }

        const { handle } = selection;
        // Only the backends the user chose *against* are worth reporting, and
        // only when something was declined — otherwise this is the happy path.
        const [firstDeclined] = selection.declined;
        if (firstDeclined) {
          addNotification({
            message: `${experiment.name} is running on the CPU: ${firstDeclined.reason}`,
            tone: "neutral",
          });
        }
        for (const note of selection.notes) {
          addNotification({
            message: `${experiment.name}: ${note.message}`,
            tone: "neutral",
          });
        }

        pendingRegistrationsRef.current.delete(experimentId);
        rememberBackend(experimentId, selection.backend);
        patchExperiment(experimentId, {
          computeBackend: selection.backendId as ExperimentComputeBackend,
          computeBackendFallbackReason: firstDeclined?.reason ?? null,
          // Stepping starts on the next line. Setup — compiling user code,
          // spinning up workers, acquiring the GPU device — is deliberately
          // outside the measurement, so the two backends are compared on the
          // work they actually differ in.
          startedAt: Date.now(),
        });

        registerExperimentHandle(experiment, handle);
        handle.start();
      } catch (error) {
        const wasPending = pendingRegistrationsRef.current.delete(experimentId);
        if (!wasPending) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        patchExperiment(experimentId, { error: message, status: "error" });
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
      patchExperiment(experimentId, { status: "cancelled" });
      return;
    }

    if (sweepSessionsRef.current.has(experimentId)) {
      disposeSweepSession(experimentId);
      patchExperiment(experimentId, { status: "cancelled" });
      return;
    }

    registrationsRef.current.get(experimentId)?.handle.cancel();
  };

  const removeExperiment: ExperimentsContextValue["removeExperiment"] = (
    experimentId,
  ) => {
    disposeSweepSession(experimentId);
    disposeExperimentHandle(experimentId);
    setExperiments((prev) =>
      prev.filter((experiment) => experiment.id !== experimentId),
    );
    if (selectedExperimentId === experimentId) {
      navigation.navigate(
        { simulateResource: null },
        { cause: "normalization", action: "simulation-resource" },
      );
    }
  };

  const setSweepSelection: ExperimentsContextValue["setSweepSelection"] = (
    experimentId,
    selection,
  ) => {
    sweepSessionsRef.current.get(experimentId)?.setSelection(selection);
  };

  const sampleSurfaceCells: ExperimentsContextValue["sampleSurfaceCells"] =
    async (experimentId, positions, runsPerCell, onPartial) => {
      const session = sweepSessionsRef.current.get(experimentId);
      if (!session) {
        return null;
      }
      // The navigator's selection always comes first: surface chunks wait
      // until it has streamed its first frames (the gate re-arms on every
      // selection change), so the metric charts fill before surface sampling
      // competes for workers.
      await session.whenSelectionStreamed();
      return session.sampleCells(positions, runsPerCell, onPartial);
    };

  const selectedExperiment =
    experiments.find((experiment) => experiment.id === selectedExperimentId) ??
    null;

  const stableSetSelectedExperimentId = useStableCallback(
    setSelectedExperimentId,
  );
  const stableCreateExperiment = useStableCallback(createExperiment);
  const stableCancelExperiment = useStableCallback(cancelExperiment);
  const stableRemoveExperiment = useStableCallback(removeExperiment);
  const stableSetSweepSelection = useStableCallback(setSweepSelection);
  const stableSampleSurfaceCells = useStableCallback(sampleSurfaceCells);
  // Built on first use: a session that never opens an optimization surface
  // or runs a study in the browser spawns no extra worker lane.
  const getDetachedObjectiveSampler = (): DetachedObjectiveSampler => {
    detachedObjectiveSamplerRef.current ??= createDetachedObjectiveSampler({
      languageClient: languageClientRef,
      createWorker: reusableWorkerFactory,
      shardCount: shardCountRef.current ?? getDefaultMonteCarloShardCount(),
    });
    return detachedObjectiveSamplerRef.current;
  };
  const sampleDetachedObjective: ExperimentsContextValue["sampleDetachedObjective"] =
    (request) => getDetachedObjectiveSampler().sample(request);
  const runDetachedObjective: ExperimentsContextValue["runDetachedObjective"] =
    (request) => getDetachedObjectiveSampler().run(request);

  const stableSampleDetachedObjective = useStableCallback(
    sampleDetachedObjective,
  );
  const stableRunDetachedObjective = useStableCallback(runDetachedObjective);

  // Every callback is identity-stable, so this object never changes and
  // actions-only consumers sit out the per-publish re-render storm.
  const [actionsValue] = useState<ExperimentsActionsValue>(() => ({
    setSelectedExperimentId: stableSetSelectedExperimentId,
    createExperiment: stableCreateExperiment,
    cancelExperiment: stableCancelExperiment,
    removeExperiment: stableRemoveExperiment,
    setSweepSelection: stableSetSweepSelection,
    sampleSurfaceCells: stableSampleSurfaceCells,
    sampleDetachedObjective: stableSampleDetachedObjective,
    runDetachedObjective: stableRunDetachedObjective,
  }));

  const contextValue: ExperimentsContextValue = {
    ...actionsValue,
    experiments,
    selectedExperimentId,
    selectedExperiment,
  };

  return (
    <ExperimentsContext.Provider value={contextValue}>
      <ExperimentsActionsContext.Provider value={actionsValue}>
        {children}
      </ExperimentsActionsContext.Provider>
    </ExperimentsContext.Provider>
  );
};
