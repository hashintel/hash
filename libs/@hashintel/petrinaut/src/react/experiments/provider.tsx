import { use, useEffect, useRef, useState } from "react";
import { v4 as generateUuid } from "uuid";

import {
  createMonteCarloExperiment,
  compileScenario,
  type InitialMarking,
  type MonteCarloExperiment,
  type MonteCarloExperimentState,
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
  type ExperimentRecord,
  type ExperimentStatus,
  ExperimentsContext,
  type ExperimentsContextValue,
  isExperimentActive,
} from "./context";

type ExperimentsProviderProps = React.PropsWithChildren<{
  workerFactory?: WorkerFactory;
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
}) => {
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const { requestHirArtifacts } = use(LanguageClientContext);
  const { addNotification } = use(NotificationsContext);
  const petriNetDefinitionRef = useLatest(petriNetDefinition);
  const extensionsRef = useLatest(extensions);
  const workerFactoryRef = useLatest(workerFactory ?? createMonteCarloWorker);
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
    setExperiments((prev) =>
      prev.map((experiment) =>
        experiment.id === experimentId
          ? { ...experiment, ...patch }
          : experiment,
      ),
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

      if (event.type === "complete" || event.type === "cancelled") {
        disposeExperimentHandle(experimentId);
      }
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

      const compiledScenario = compileScenario(
        selectedScenario,
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
        const { artifacts, failures } = await requestHirArtifacts(
          compiledExperimentSdcpn,
          experimentExtensions,
        );

        // Compilation cannot currently be aborted. A cancelled or removed
        // experiment must stop here rather than turning a late compile result
        // (or failure below) into a worker or an error notification.
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
          // its metric definitions. Run the worker against the exact snapshot
          // used above rather than the pre-substitution model.
          sdcpn: compiledExperimentSdcpn,
          extensions: experimentExtensions,
          initialMarking,
          parameterValues,
          seed: input.seed,
          dt: input.dt,
          maxTime: input.maxTime,
          hirArtifacts: artifacts,
          runCount: input.runCount,
        };

        const handle = await createMonteCarloExperiment({
          ...experimentConfigBase,
          createWorker: workerFactoryRef.current,
          metricSpecs,
          signal: abortController.signal,
        });

        if (!pendingRegistrationsRef.current.has(experimentId)) {
          handle.dispose();
          return;
        }

        pendingRegistrationsRef.current.delete(experimentId);
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
