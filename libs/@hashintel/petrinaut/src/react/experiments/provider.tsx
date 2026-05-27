import { use, useEffect, useRef, useState } from "react";
import { v4 as generateUuid } from "uuid";

import {
  createMonteCarloExperiment,
  type InitialMarking,
  type MonteCarloExperiment,
  type MonteCarloExperimentState,
  type WorkerFactory,
  type Scenario,
  type ScenarioParameter,
} from "@hashintel/petrinaut-core";

import { useEvalSandbox } from "../eval-sandbox/context";
import { useBlockWindowClose } from "../hooks/use-block-window-close";
import { useLatest } from "../hooks/use-latest";
import { useStableCallback } from "../hooks/use-stable-callback";
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
  /**
   * Legacy escape hatch: factory that produces the Monte Carlo worker.
   * `PetrinautProvider` only forwards a value here when no host
   * `evalSandbox` is supplied — see its `effectiveMonteCarloWorkerFactory`
   * branch. When a host sandbox is provided, this prop is `undefined`
   * and worker creation is delegated to the sandbox.
   */
  workerFactory?: WorkerFactory;
}>;

type ExperimentHandleRegistration = {
  handle: MonteCarloExperiment;
  off: () => void;
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
}

export const ExperimentsProvider: React.FC<ExperimentsProviderProps> = ({
  children,
  workerFactory,
}) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { addNotification } = use(NotificationsContext);
  const evalSandbox = useEvalSandbox();
  const petriNetDefinitionRef = useLatest(petriNetDefinition);
  // Mirror of `SimulationProvider`'s worker resolution: when a host
  // `evalSandbox` is wired up, `PetrinautProvider` passes
  // `workerFactory: undefined` and we delegate to the sandbox. The
  // legacy `workerFactory` prop wins only when no host sandbox is set.
  const sandboxMonteCarloFactory: WorkerFactory = () =>
    evalSandbox.createMonteCarloWorker();
  const workerFactoryRef = useLatest(workerFactory ?? sandboxMonteCarloFactory);
  const registrationsRef = useRef(
    new Map<string, ExperimentHandleRegistration>(),
  );
  const [experiments, setExperiments] = useState<ExperimentRecord[]>([]);
  const [selectedExperimentId, setSelectedExperimentId] = useState<
    string | null
  >(null);
  useBlockWindowClose({ shouldBlock: experiments.some(isExperimentActive) });

  useEffect(() => {
    const registrations = registrationsRef.current;
    return () => {
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
        distributionFrames: handle.distributions.get().frames,
        progress: handle.progress.get(),
        status: mapExperimentStatus(handle.status.get()),
      });
    };

    const unsubscribeStatus = handle.status.subscribe(sync);
    const unsubscribeProgress = handle.progress.subscribe(sync);
    const unsubscribeDistributions = handle.distributions.subscribe(sync);
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
        unsubscribeDistributions();
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

    if (selectedScenario) {
      const parsedScenarioValues = parseScenarioParameterValues(
        selectedScenario,
        input.scenarioParameterValues,
      );
      if (parsedScenarioValues.errors.length > 0) {
        throw new Error(parsedScenarioValues.errors.join("\n"));
      }

      const compiledScenario = await evalSandbox.compileScenario({
        scenario: selectedScenario,
        netParameters: sdcpn.parameters,
        places: sdcpn.places,
        types: sdcpn.types,
        scenarioParameterValues: parsedScenarioValues.values,
      });
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
      progress: null,
      distributionFrames: [],
    };

    setExperiments((prev) => [experiment, ...prev]);
    setSelectedExperimentId(experimentId);

    try {
      const handle = await createMonteCarloExperiment({
        sdcpn,
        initialMarking,
        parameterValues,
        seed: input.seed,
        dt: input.dt,
        maxTime: input.maxTime,
        runCount: input.runCount,
        createWorker: workerFactoryRef.current,
      });
      registerExperimentHandle(experiment, handle);
      handle.start();
    } catch (error) {
      patchExperiment(experimentId, {
        error: error instanceof Error ? error.message : String(error),
        status: "error",
      });
      throw error;
    }

    return experimentId;
  };

  const cancelExperiment: ExperimentsContextValue["cancelExperiment"] = (
    experimentId,
  ) => {
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
