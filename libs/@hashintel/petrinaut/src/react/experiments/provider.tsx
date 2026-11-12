/**
 * @layerRoot react.experiments
 * @role Tracks Monte Carlo experiment handles and their streamed metric results
 */

import { use, useEffect, useRef, useState } from "react";
import { v4 as generateUuid } from "uuid";

import { type MonteCarloExperiment } from "@hashintel/petrinaut-core";
import {
  type ExperimentBackendRegistration,
  selectExperimentBackend,
  type ExperimentBackend,
} from "@hashintel/petrinaut-core/experiments";

import { useBlockWindowClose } from "../hooks/use-block-window-close";
import { useLatest } from "../hooks/use-latest";
import { useStableCallback } from "../hooks/use-stable-callback";
import { LanguageClientContext } from "../lsp/context";
import {
  openPetrinautSimulationResource,
  usePetrinautNavigation,
} from "../navigation";
import { NotificationsContext } from "../notifications/context";
import { findSimulator, SimulatorsContext } from "../simulators/context";
import { SDCPNContext } from "../state/sdcpn-context";
import {
  type CreateExperimentOptions,
  type ExperimentRecord,
  ExperimentsActionsContext,
  type ExperimentsActionsValue,
  ExperimentsContext,
  type ExperimentsContextValue,
  isExperimentActive,
  isTerminalExperimentStatus,
} from "./context";
import { experimentSdcpnWithMetrics } from "./experiment-sdcpn-with-metrics";
import {
  assertExperimentInput,
  buildSweepAxes,
  compileExperimentScenario,
  computeBackendOf,
  createExperimentRequestBuilder,
  experimentSimulatorBackends,
  newExperimentRecord,
} from "./provider/create-experiment";
import {
  latestFramesById,
  mapExperimentStatus,
  patchExperimentRecords,
} from "./provider/experiment-records";
import { createSweepBatchInstantiator } from "./provider/sweep-batch-instantiation";
import { errorMessage } from "./shared/error-message";
import { createSweepSession, type SweepSession } from "./sweep-session";

import type { ExperimentParameterAxis } from "./parameter-grid";
import type {
  BuildExperimentRequest,
  SweptScenarioCompiler,
} from "./provider/shared/experiment-request";

export { buildSweepAxes } from "./provider/create-experiment";

type ExperimentHandleRegistration = {
  handle: MonteCarloExperiment;
  off: () => void;
};

type PendingExperimentRegistration = {
  abortController: AbortController;
};

/**
 * Throws `message` as an error. A `throw` statement inside `try` keeps React
 * Compiler from compiling the provider, so the initialization calls this.
 */
const fail: (message: string) => never = (message) => {
  throw new Error(message);
};

/**
 * Creates experiments on the simulators the host registers, and lists them
 * with what they stream. The workers, their pool and the GPU are the
 * simulators' own; this provider compiles the request and follows the handle.
 */
export const ExperimentsProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const languageClient = use(LanguageClientContext);
  const { addNotification } = use(NotificationsContext);
  const simulatorsRef = useLatest(use(SimulatorsContext));
  const navigation = usePetrinautNavigation();
  const petriNetDefinitionRef = useLatest(petriNetDefinition);
  const extensionsRef = useLatest(extensions);
  const languageClientRef = useLatest(languageClient);
  const registrationsRef = useRef(
    new Map<string, ExperimentHandleRegistration>(),
  );
  const pendingRegistrationsRef = useRef(
    new Map<string, PendingExperimentRegistration>(),
  );
  const sweepSessionsRef = useRef(new Map<string, SweepSession>());
  const ownershipRef = useRef(
    new Map<string, NonNullable<CreateExperimentOptions["ownership"]>>(),
  );
  /** Backends an experiment chose, disposed with the experiment. */
  const backendsRef = useRef(new Map<string, ExperimentBackend[]>());
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
    return () => {
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
    if (patch.error) {
      ownershipRef.current.get(experimentId)?.onError?.(patch.error);
    }
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

  /**
   * What the record says about the backend that ran, and the notice when it
   * is not the one asked for.
   */
  const recordChosenBackend = (
    experiment: ExperimentRecord,
    selection: {
      backendId: string;
      declined: readonly { reason: string }[];
    },
  ) => {
    const [firstDeclined] = selection.declined;
    const simulator = findSimulator(
      simulatorsRef.current.registrations,
      selection.backendId,
    );
    if (firstDeclined) {
      addNotification({
        message: `${experiment.name} is running on ${
          simulator?.label ?? selection.backendId
        }: ${firstDeclined.reason}`,
        tone: "neutral",
      });
    }
    patchExperiment(experiment.id, {
      computeBackend: computeBackendOf(selection.backendId),
      computeBackendFallbackReason: firstDeclined?.reason ?? null,
      simulatorLabel: simulator?.label ?? null,
      // Stepping starts next. Setup — compiling user code, spinning up
      // workers, acquiring the GPU device — is deliberately outside the
      // measurement, so two backends are compared on the work they differ
      // in.
      startedAt: Date.now(),
    });
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
        if (!ownershipRef.current.has(experimentId)) {
          addNotification({
            message: `${experimentName} failed: ${event.message}`,
            tone: "error",
          });
        }
      } else {
        sync();
      }

      if (
        event.type === "complete" &&
        !ownershipRef.current.has(experimentId)
      ) {
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
      initialSelection: experiment.sweep?.selection,
      runCount: experiment.runCount,
      seed: experiment.seed,
      // Nothing computes until a control moves or an optimizer navigates.
      startComputing: false,
      requireSuccessfulRuns: experiment.requestActive === true,
      // Leading-edge, so the first frames publish instantly; while a
      // batch streams, ~10 re-renders a second read as live on a chart
      // and leave the rest of the UI most of each frame's budget.
      publishThrottleMs: 100,
      instantiateBatch: createSweepBatchInstantiator({
        axes,
        registrations,
        buildRequest,
        compiler,
        netParameterVariableNames,
        onBackendChosen: (selection) => {
          rememberBackend(experimentId, selection.backend);
          recordChosenBackend(experiment, selection);
        },
        onNote,
      }),
      onUpdate: (update) => {
        patchExperiment(experimentId, {
          status: update.failed
            ? "error"
            : update.computing
              ? "running"
              : "idle",
          // A failure belongs to the selection that failed: the next
          // selection's publish clears it from the record.
          ...(update.failed ? {} : { error: null }),
          metricFrames: update.metricFrames,
          latestMetricFramesById: latestFramesById(update.metricFrames),
          progress: update.progress,
          sweep: {
            selection: update.selection,
            selectionKey: update.selectionKey,
            runsCompleted: update.runsCompleted,
            runsSampled: update.runsSampled,
            runTarget: update.runTarget,
            computing: update.computing,
            visited: update.visited,
          },
          sweepBatches: update.batches,
        });
      },
      onError: (message) => {
        patchExperiment(experimentId, {
          error: message,
          status: "error",
        });
        if (!ownershipRef.current.has(experimentId)) {
          addNotification({
            message: `${experiment.name} failed: ${message}`,
            tone: "error",
          });
        }
      },
    });
    sweepSessionsRef.current.set(experimentId, session);
  };

  const cancelExperiment: ExperimentsContextValue["cancelExperiment"] = (
    experimentId,
  ) => {
    const ownership = ownershipRef.current.get(experimentId);
    if (ownership && !ownership.signal.aborted) {
      ownership.cancel();
      return;
    }
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

  const createExperiment: ExperimentsContextValue["createExperiment"] = async (
    input,
    options,
  ) => {
    assertExperimentInput(input);

    const sdcpn = options?.definition ?? petriNetDefinitionRef.current;
    const experimentExtensions = options?.extensions ?? extensionsRef.current;
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
    options?.ownership?.signal.throwIfAborted();

    // Resolved before the record exists, so a simulator nobody registered
    // rejects the creation instead of listing an experiment that cannot run.
    const { registrations, samplePeriod } = experimentSimulatorBackends(
      simulatorsRef.current,
      input,
    );

    const experimentId = generateUuid();
    const experiment = newExperimentRecord({
      id: experimentId,
      input: samplePeriod === input.dt ? input : { ...input, dt: samplePeriod },
      scenarioName:
        scenario?.name ?? (input.adHocScenario ? "Ad-hoc scenario" : null),
      axes: compiled.axes,
      fixedScenarioValues: compiled.fixedScenarioValues,
      scenario: compiled.scenario,
    });
    experiment.definition = experimentSdcpn;
    const ownership = options?.ownership;
    if (ownership) {
      experiment.requestActive = true;
      ownershipRef.current.set(experimentId, ownership);
      const cancel = () => cancelExperiment(experimentId);
      ownership.signal.addEventListener("abort", cancel, { once: true });
      void ownership.finished.finally(() => {
        ownership.signal.removeEventListener("abort", cancel);
        ownershipRef.current.delete(experimentId);
        patchExperiment(experimentId, { requestActive: false });
      });
    }
    setExperiments((prev) => [experiment, ...prev]);

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
          dt: samplePeriod,
          sdcpn: compiledExperimentSdcpn,
          extensions: experimentExtensions,
          compiled,
          requestHirArtifacts: languageClientRef.current.requestHirArtifacts,
        });
        const onNote = (note: { message: string }) => {
          addNotification({
            message: `${experiment.name}: ${note.message}`,
            tone: "error",
          });
        };

        if (compiled.axes.length > 0 && compiled.sweptCompiler) {
          startSweepSession({
            experiment,
            axes: compiled.axes,
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
          fail(
            selection.declined
              .map((entry) => `${entry.backendId}: ${entry.reason}`)
              .join("; ") || "No compute backend could run this experiment.",
          );
        }

        const { handle } = selection;
        for (const note of selection.notes) {
          addNotification({
            message: `${experiment.name}: ${note.message}`,
            tone: "neutral",
          });
        }

        pendingRegistrationsRef.current.delete(experimentId);
        rememberBackend(experimentId, selection.backend);
        // Only the backends the user chose *against* are worth reporting, and
        // only when something was declined — otherwise this is the happy path.
        recordChosenBackend(experiment, selection);

        registerExperimentHandle(experiment, handle);
        handle.start();
      } catch (error) {
        const wasPending = pendingRegistrationsRef.current.delete(experimentId);
        if (!wasPending) {
          return;
        }

        const message = errorMessage(error);
        patchExperiment(experimentId, { error: message, status: "error" });
        if (!ownershipRef.current.has(experimentId)) {
          addNotification({
            message: `${experiment.name} failed: ${message}`,
            tone: "error",
          });
        }
      }
    };

    void initializeExperiment();

    return experiment;
  };

  const adoptExperiment: ExperimentsContextValue["adoptExperiment"] = (
    input,
  ) => {
    const experimentId = generateUuid();
    const experiment: ExperimentRecord = {
      ...newExperimentRecord({
        id: experimentId,
        input: {
          name: input.name,
          scenarioId: input.scenarioId,
          scenarioParameterValues: {},
          runCount: input.runCount,
          seed: input.seed,
          dt: input.dt,
          maxTime: input.maxTime,
          metricSpecs: input.metricSpecs,
        },
        scenarioName: input.scenarioName,
        axes: [],
        fixedScenarioValues: {},
        scenario: null,
      }),
      definition: input.definition,
      computeBackend: input.computeBackend,
      simulatorLabel: input.simulatorLabel ?? null,
      // When it began stepping is its previous owner's knowledge; from here
      // the record counts from the moment it was listed.
      startedAt: Date.now(),
    };
    setExperiments((prev) => [experiment, ...prev]);
    registerExperimentHandle(experiment, input.handle);
    // A finished experiment reports nothing more, so nothing would release
    // its handle: its frames are in the record already.
    const status = input.handle.status.get();
    if (status === "Complete" || status === "Error" || status === "Cancelled") {
      disposeExperimentHandle(experimentId);
    }
    return experiment;
  };

  const removeExperiment: ExperimentsContextValue["removeExperiment"] = (
    experimentId,
  ) => {
    if (ownershipRef.current.has(experimentId)) {
      return;
    }
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
    if (ownershipRef.current.has(experimentId)) {
      return;
    }
    sweepSessionsRef.current.get(experimentId)?.setSelection(selection);
  };

  const navigateSweep: ExperimentsContextValue["navigateSweep"] = (
    experimentId,
    selection,
    options,
  ) =>
    sweepSessionsRef.current
      .get(experimentId)
      ?.navigateTo(selection, options) ??
    Promise.reject(new Error("The sweep is no longer running"));

  const selectedExperiment =
    experiments.find((experiment) => experiment.id === selectedExperimentId) ??
    null;

  const stableSetSelectedExperimentId = useStableCallback(
    setSelectedExperimentId,
  );
  const stableCreateExperiment = useStableCallback(createExperiment);
  const stableAdoptExperiment = useStableCallback(adoptExperiment);
  const stableCancelExperiment = useStableCallback(cancelExperiment);
  const stableRemoveExperiment = useStableCallback(removeExperiment);
  const stableSetSweepSelection = useStableCallback(setSweepSelection);
  const stableNavigateSweep = useStableCallback(navigateSweep);
  // Every callback is identity-stable, so this object never changes and
  // actions-only consumers sit out the per-publish re-render storm.
  const [actionsValue] = useState<ExperimentsActionsValue>(() => ({
    setSelectedExperimentId: stableSetSelectedExperimentId,
    createExperiment: stableCreateExperiment,
    adoptExperiment: stableAdoptExperiment,
    cancelExperiment: stableCancelExperiment,
    removeExperiment: stableRemoveExperiment,
    setSweepSelection: stableSetSweepSelection,
    navigateSweep: stableNavigateSweep,
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
