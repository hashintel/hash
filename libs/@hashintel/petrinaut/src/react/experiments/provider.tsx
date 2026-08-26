/**
 * @layerRoot react.experiments
 * @role Tracks Monte Carlo experiment handles and their streamed metric results
 */

import { use, useEffect, useRef, useState } from "react";
import { v4 as generateUuid } from "uuid";

import {
  compileScenario,
  getOwn,
  type InitialMarking,
  type MonteCarloExperiment,
  type MonteCarloExperimentState,
  getDefaultMonteCarloShardCount,
  type WorkerFactory,
  type Scenario,
  type ScenarioParameter,
} from "@hashintel/petrinaut-core";
import {
  createWorkerPoolExperimentBackend,
  selectExperimentBackend,
  WORKER_POOL_BACKEND_ID,
  type ExperimentBackendRegistration,
  type ExperimentRequest,
} from "@hashintel/petrinaut-core/experiments";
import { createMonteCarloWorker } from "@hashintel/petrinaut-core/workers/monte-carlo";

import { useBlockWindowClose } from "../hooks/use-block-window-close";
import { useLatest } from "../hooks/use-latest";
import { useStableCallback } from "../hooks/use-stable-callback";
import { LanguageClientContext } from "../lsp/context";
import { NotificationsContext } from "../notifications/context";
import { SDCPNContext } from "../state/sdcpn-context";
import {
  type CreateExperimentInput,
  type ExperimentComputeBackend,
  type ExperimentRecord,
  type ExperimentStatus,
  ExperimentsContext,
  type ExperimentsContextValue,
  isExperimentActive,
  isTerminalExperimentStatus,
} from "./context";

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

function parseScenarioParameterValues(
  scenario: Scenario,
  rawValues: Record<string, string>,
): { values: Record<string, number>; errors: string[] } {
  const values: Record<string, number> = {};
  const errors: string[] = [];

  for (const parameter of scenario.scenarioParameters) {
    const parsed = parseScenarioParameterValue(
      parameter,
      rawValues[parameter.identifier],
    );

    if (typeof parsed === "string") {
      errors.push(parsed);
    } else {
      values[parameter.identifier] = parsed;
    }
  }

  return { values, errors };
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
  experimentShardCount,
}) => {
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const { requestHirArtifacts, requestScenarioHir } = use(
    LanguageClientContext,
  );
  const { addNotification } = use(NotificationsContext);
  const petriNetDefinitionRef = useLatest(petriNetDefinition);
  const extensionsRef = useLatest(extensions);
  const workerFactoryRef = useLatest(workerFactory ?? createMonteCarloWorker);
  const shardCountRef = useLatest(experimentShardCount);
  const registrationsRef = useRef(
    new Map<string, ExperimentHandleRegistration>(),
  );
  const pendingRegistrationsRef = useRef(
    new Map<string, PendingExperimentRegistration>(),
  );
  const [experiments, setExperiments] = useState<ExperimentRecord[]>([]);
  const [selectedExperimentId, setSelectedExperimentId] = useState<
    string | null
  >(null);
  useBlockWindowClose({ shouldBlock: experiments.some(isExperimentActive) });

  useEffect(() => {
    const registrations = registrationsRef.current;
    const pendingRegistrations = pendingRegistrationsRef.current;
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
    };
  }, []);

  const patchExperiment = (
    experimentId: string,
    patch: Partial<ExperimentRecord>,
  ) => {
    // A patch that moves the experiment to a terminal status is stamped with the
    // arrival time here rather than at each call site, so that no path — normal
    // completion, a worker error, or cancellation — can finish an experiment
    // without recording when it stopped.
    const finishedAt =
      patch.status !== undefined && isTerminalExperimentStatus(patch.status)
        ? Date.now()
        : null;

    setExperiments((prev) =>
      prev.map((experiment) => {
        if (experiment.id !== experimentId) {
          return experiment;
        }

        return {
          ...experiment,
          ...patch,
          // The status, progress and event subscriptions can each sync the same
          // terminal status, so only the first stamp counts. Their timestamps
          // coincide today — the engine tears its transports down on reaching a
          // terminal state, so nothing arrives later — which is why no test can
          // tell this apart from re-stamping. It is here so that the recorded
          // time stays the moment the run stopped if that ever changes.
          ...(finishedAt !== null && experiment.finishedAt === null
            ? { finishedAt }
            : {}),
        };
      }),
    );
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

      // Every member of this event union is terminal — `complete`, `cancelled`,
      // `error` — so any event means the handle is finished with. Disposal is
      // what releases the backend's resources; for the GPU path that is
      // `device.destroy()`, and skipping it on `error` left a live GPUDevice
      // held until the record was removed.
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

    let parameterValues: Record<string, string> = {};
    let initialMarking: InitialMarking = {};
    const globalParameters = extensionsRef.current.parameters
      ? sdcpn.parameters
      : [];
    const experimentSdcpn = extensionsRef.current.parameters
      ? sdcpn
      : { ...sdcpn, parameters: [] };

    if (selectedScenario) {
      const parsedScenarioValues = parseScenarioParameterValues(
        selectedScenario,
        input.scenarioParameterValues,
      );
      if (parsedScenarioValues.errors.length > 0) {
        throw new Error(parsedScenarioValues.errors.join("\n"));
      }

      const scenarioHir = await requestScenarioHir(selectedScenario);
      const compiledScenario = compileScenario(
        selectedScenario,
        scenarioHir,
        globalParameters,
        sdcpn.places,
        sdcpn.types,
        { scenarioParameterValues: parsedScenarioValues.values },
      );
      if (!compiledScenario.ok) {
        throw new Error(
          compiledScenario.errors
            .map((error) => `${error.source}:${error.itemId} ${error.message}`)
            .join("\n"),
        );
      }

      parameterValues = compiledScenario.result.parameterValues;
      initialMarking = compiledScenario.result.initialState;
    }

    const experimentId = generateUuid();
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
      computeBackend: "cpu",
      computeBackendFallbackReason: null,
      startedAt: null,
      finishedAt: null,
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
        // substituting them for the model's metrics.
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

        // Built per backend rather than once, because the HIR trees roughly
        // triple the artifact payload structured-cloned to every shard worker,
        // and only a shader-generating backend reads them. `needsHirTrees` comes
        // from the backend itself, so a new backend cannot be forgotten here.
        const buildRequest = async ({
          needsHirTrees,
        }: {
          needsHirTrees: boolean;
        }): Promise<ExperimentRequest> => {
          const { artifacts, failures } = await requestHirArtifacts(
            compiledExperimentSdcpn,
            experimentExtensions,
            { includeHir: needsHirTrees },
          );

          const metricSpecs = input.metricSpecs.map((spec) => {
            if (spec.kind !== "expression") {
              return spec;
            }
            const artifact = getOwn(artifacts.metrics, spec.id);
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

          return {
            // Artifact fingerprints cover the complete sanitized SDCPN,
            // including its metric definitions. Run against the exact snapshot
            // compiled above rather than the pre-substitution model.
            sdcpn: compiledExperimentSdcpn,
            extensions: experimentExtensions,
            initialMarking,
            parameterValues,
            seed: input.seed,
            dt: input.dt,
            maxTime: input.maxTime,
            runCount: input.runCount,
            metricSpecs,
            hirArtifacts: artifacts,
          };
        };

        // Preference order, best first. The GPU backend is only a candidate when
        // it was asked for; the worker-pool backend is always last because it
        // accepts everything, which is what makes it the fallback.
        const registrations: ExperimentBackendRegistration[] = [];
        if (input.computeBackend === "webgpu") {
          registrations.push({
            id: "webgpu",
            label: "GPU (WebGPU)",
            // Imported here, not at module scope, so a session that never asks
            // for the GPU never loads the shader generator.
            load: async () => {
              const { createWebGpuExperimentBackend } =
                await import("@hashintel/petrinaut-core/webgpu");
              return createWebGpuExperimentBackend();
            },
          });
        }
        registrations.push({
          id: WORKER_POOL_BACKEND_ID,
          label: "CPU (Web Workers)",
          load: () =>
            Promise.resolve(
              createWorkerPoolExperimentBackend({
                createWorker: workerFactoryRef.current,
                // The experiment never inspects the host, so the provider — the
                // piece that knows this is a browser — states the parallelism.
                shardCount:
                  shardCountRef.current ?? getDefaultMonteCarloShardCount(),
              }),
            ),
        });

        const selection = await selectExperimentBackend({
          registrations,
          buildRequest,
          instantiateOptions: {
            signal: abortController.signal,
            // Problems only detectable once running — a saturated histogram —
            // arrive too late for the notes returned at selection.
            onNote: (note) => {
              addNotification({
                message: `${experiment.name}: ${note.message}`,
                tone: "error",
              });
            },
          },
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
        const usedBackend = selection.backendId as ExperimentComputeBackend;
        // Only the backends the user chose *against* are worth reporting, and
        // only when something was declined — otherwise this is the happy path.
        const [firstDeclined] = selection.declined;
        const fallbackReason = firstDeclined?.reason ?? null;
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
        patchExperiment(experimentId, {
          computeBackend: usedBackend,
          computeBackendFallbackReason: fallbackReason,
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
      patchExperiment(experimentId, { status: "cancelled" });
      return;
    }

    registrationsRef.current.get(experimentId)?.handle.cancel();
  };

  const removeExperiment: ExperimentsContextValue["removeExperiment"] = (
    experimentId,
  ) => {
    disposeExperimentHandle(experimentId);
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
