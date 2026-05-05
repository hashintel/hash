import { use, useEffect, useRef, useState } from "react";

import {
  compileScenario,
  type CompiledScenarioResult,
} from "./compile-scenario";
import { deriveDefaultParameterValues } from "../hooks/use-default-parameter-values";
import { useLatest } from "../hooks/use-latest";
import { useStableCallback } from "../hooks/use-stable-callback";
import { useNotifications } from "../notifications/notifications-context";
import { SDCPNContext } from "../state/sdcpn-context";
import {
  type InitialMarking,
  SimulationContext,
  type SimulationContextValue,
  type SimulationFrame,
  type SimulationState,
} from "./context";
import {
  useSimulationWorker,
  type WorkerStatus,
} from "./worker/use-simulation-worker";

/**
 * Internal state for the simulation provider.
 * Configuration values that aren't managed by the worker.
 */
type SimulationStateValues = {
  parameterValues: Record<string, string>;
  initialMarking: InitialMarking;
  selectedScenarioId: string | null;
  /** User-editable scenario parameter values (identifier → string value). */
  scenarioParameterValues: Record<string, string>;
  dt: number;
  maxTime: number | null;
};

const INITIAL_STATE_VALUES: SimulationStateValues = {
  parameterValues: {},
  initialMarking: new Map(),
  selectedScenarioId: null,
  scenarioParameterValues: {},
  dt: 0.01,
  maxTime: null,
};

/**
 * Maps worker status to SimulationContext state.
 */
function mapWorkerStatusToSimulationState(
  status: WorkerStatus,
): SimulationState {
  switch (status) {
    case "idle":
    case "initializing":
      return "NotRun";
    case "ready":
    case "paused":
      return "Paused";
    case "running":
      return "Running";
    case "complete":
      return "Complete";
    case "error":
      return "Error";
  }
}

/**
 * Internal component that subscribes to simulation state changes
 * and shows notifications when appropriate.
 */
const SimulationStateNotifier: React.FC = () => {
  const { notify } = useNotifications();
  const { state } = use(SimulationContext);
  const previousStateRef = useRef<SimulationState | null>(null);

  useEffect(() => {
    const previousState = previousStateRef.current;
    previousStateRef.current = state;

    // Notify when simulation completes
    if (state === "Complete" && previousState !== "Complete") {
      notify({ message: "Simulation complete" });
    }
  }, [state, notify]);

  return null;
};

type SimulationProviderProps = React.PropsWithChildren;

export const SimulationProvider: React.FC<SimulationProviderProps> = ({
  children,
}) => {
  const sdcpnContext = use(SDCPNContext);
  const { petriNetId, petriNetDefinition } = sdcpnContext;

  const petriNetDefinitionRef = useLatest(petriNetDefinition);

  // Configuration state (not managed by worker)
  const [stateValues, setStateValues] =
    useState<SimulationStateValues>(INITIAL_STATE_VALUES);

  // Ref for accessing latest state in callbacks
  const stateValuesRef = useLatest(stateValues);

  // WebWorker for simulation computation
  const { state: workerState, actions: workerActions } = useSimulationWorker();

  // Reinitialize when petriNetId changes
  useEffect(() => {
    workerActions.reset();
    setStateValues(INITIAL_STATE_VALUES);
  }, [petriNetId, workerActions]);

  //
  // Actions
  //

  const setSelectedScenarioId: SimulationContextValue["setSelectedScenarioId"] =
    (scenarioId) => {
      setStateValues((prev) => {
        // Initialize scenario parameter values from the scenario's defaults
        const scenarioParameterValues: Record<string, string> = {};
        if (scenarioId) {
          const sc = petriNetDefinition.scenarios?.find(
            (s) => s.id === scenarioId,
          );
          if (sc) {
            for (const sp of sc.scenarioParameters) {
              scenarioParameterValues[sp.identifier] = String(sp.default);
            }
          }
        }
        return {
          ...prev,
          selectedScenarioId: scenarioId,
          scenarioParameterValues,
        };
      });
    };

  const setScenarioParameterValue: SimulationContextValue["setScenarioParameterValue"] =
    (identifier, value) => {
      setStateValues((prev) => ({
        ...prev,
        scenarioParameterValues: {
          ...prev.scenarioParameterValues,
          [identifier]: value,
        },
      }));
    };

  const setInitialMarking: SimulationContextValue["setInitialMarking"] = (
    placeId,
    marking,
  ) => {
    setStateValues((prev) => {
      const newMarking = new Map(prev.initialMarking);
      newMarking.set(placeId, marking);
      return { ...prev, initialMarking: newMarking };
    });
  };

  const setParameterValue: SimulationContextValue["setParameterValue"] = (
    parameterId,
    value,
  ) => {
    setStateValues((prev) => ({
      ...prev,
      parameterValues: {
        ...prev.parameterValues,
        [parameterId]: value,
      },
    }));
  };

  const setDt: SimulationContextValue["setDt"] = (dt) => {
    setStateValues((prev) => ({ ...prev, dt }));
  };

  const setMaxTime: SimulationContextValue["setMaxTime"] = (maxTime) => {
    setStateValues((prev) => ({ ...prev, maxTime }));
  };

  const initialize: SimulationContextValue["initialize"] = ({
    seed,
    dt,
    maxFramesAhead,
    batchSize,
  }) => {
    const currentState = stateValuesRef.current;
    const sdcpn = petriNetDefinitionRef.current;

    // Update local dt
    setStateValues((prev) => ({ ...prev, dt }));

    // Use effective values (scenario-overridden when a scenario is active)
    // instead of raw stateValues which don't include the compiled output.
    return workerActions.initialize({
      sdcpn,
      // eslint-disable-next-line no-use-before-define -- closure; ref is defined later in render
      initialMarking: effectiveInitialMarkingRef.current,
      // eslint-disable-next-line no-use-before-define -- closure; ref is defined later in render
      parameterValues: effectiveParameterValuesRef.current,
      seed,
      dt,
      maxTime: currentState.maxTime,
      maxFramesAhead,
      batchSize,
    });
  };

  const run: SimulationContextValue["run"] = () => {
    // Worker handles all guard logic (not initialized, already running, complete, error)
    workerActions.start();
  };

  const pause: SimulationContextValue["pause"] = () => {
    workerActions.pause();
  };

  const reset: SimulationContextValue["reset"] = () => {
    const sdcpn = petriNetDefinitionRef.current;
    const defaultValues = deriveDefaultParameterValues(sdcpn.parameters);

    const parameterValues: Record<string, string> = {};
    for (const [key, value] of Object.entries(defaultValues)) {
      parameterValues[key] = String(value);
    }

    workerActions.reset();

    setStateValues((prev) => ({
      ...prev,
      parameterValues,
      // Keep initialMarking when resetting - it's configuration, not simulation state
    }));
  };

  const setBackpressure: SimulationContextValue["setBackpressure"] = (
    params,
  ) => {
    workerActions.setBackpressure(params);
  };

  const ack: SimulationContextValue["ack"] = (frameNumber) => {
    workerActions.ack(frameNumber);
  };

  // Ref for accessing latest frames in stable callbacks
  const framesRef = useLatest(workerState.frames);

  // Frame access - get from worker state
  const getFrame: SimulationContextValue["getFrame"] = (
    frameIndex: number,
  ): Promise<SimulationFrame | null> => {
    const frame = framesRef.current[frameIndex];
    return Promise.resolve(frame ?? null);
  };

  // Get all frames - get from worker state
  const getAllFrames: SimulationContextValue["getAllFrames"] = () => {
    return Promise.resolve(framesRef.current);
  };

  // Get frames in a range - for incremental updates
  const getFramesInRange: SimulationContextValue["getFramesInRange"] = (
    startIndex: number,
    endIndex?: number,
  ) => {
    const frames = framesRef.current;
    const start = Math.max(0, startIndex);
    const end =
      endIndex === undefined
        ? frames.length
        : Math.min(endIndex, frames.length);
    return Promise.resolve(frames.slice(start, end));
  };

  // Map worker state to context value
  const simulationState = mapWorkerStatusToSimulationState(workerState.status);
  const totalFrames = workerState.frames.length;

  // Compile scenario when one is selected — computed during render.
  // React Compiler will memoize based on inputs.
  let compiledScenarioResult: CompiledScenarioResult | null = null;
  if (stateValues.selectedScenarioId) {
    const selectedScenario = petriNetDefinition.scenarios?.find(
      (s) => s.id === stateValues.selectedScenarioId,
    );
    if (selectedScenario) {
      // Build a scenario with user-tweaked parameter values
      const tweakedScenario = {
        ...selectedScenario,
        scenarioParameters: selectedScenario.scenarioParameters.map((sp) => ({
          ...sp,
          default: Number(
            stateValues.scenarioParameterValues[sp.identifier] ?? sp.default,
          ),
        })),
      };
      const outcome = compileScenario(
        tweakedScenario,
        petriNetDefinition.parameters,
        petriNetDefinition.places,
        petriNetDefinition.types,
      );
      if (outcome.ok) {
        compiledScenarioResult = outcome.result;
        // eslint-disable-next-line no-console
        console.log("[Scenario] compiled", compiledScenarioResult);
      } else {
        // eslint-disable-next-line no-console
        console.warn("[Scenario] compilation errors", outcome.errors);
      }
    }
  }

  // When a scenario is compiled, override parameterValues and initialMarking
  // with the scenario's resolved output.
  let effectiveParameterValues = stateValues.parameterValues;
  let effectiveInitialMarking = stateValues.initialMarking;

  if (compiledScenarioResult) {
    effectiveParameterValues = compiledScenarioResult.parameterValues;

    // Merge compiled scenario initial state on top of manual markings.
    // Places defined in the scenario override manual state; places not
    // mentioned keep their existing manual markings (e.g. colored places
    // configured via the spreadsheet).
    const mergedMarking: InitialMarking = new Map(stateValues.initialMarking);
    for (const [placeId, marking] of Object.entries(
      compiledScenarioResult.initialState,
    )) {
      mergedMarking.set(placeId, {
        values: new Float64Array(marking.values),
        count: marking.count,
      });
    }
    effectiveInitialMarking = mergedMarking;
  }

  // Keep refs to effective values so `initialize` uses scenario-overridden
  // values instead of raw stateValues (which don't include compiled output).
  const effectiveParameterValuesRef = useLatest(effectiveParameterValues);
  const effectiveInitialMarkingRef = useLatest(effectiveInitialMarking);

  const contextValue: SimulationContextValue = {
    state: simulationState,
    error: workerState.error,
    errorItemId: workerState.errorItemId,
    parameterValues: effectiveParameterValues,
    initialMarking: effectiveInitialMarking,
    selectedScenarioId: stateValues.selectedScenarioId,
    scenarioParameterValues: stateValues.scenarioParameterValues,
    compiledScenarioResult,
    dt: stateValues.dt,
    maxTime: stateValues.maxTime,
    totalFrames,
    getFrame: useStableCallback(getFrame),
    getAllFrames: useStableCallback(getAllFrames),
    getFramesInRange: useStableCallback(getFramesInRange),
    setSelectedScenarioId: useStableCallback(setSelectedScenarioId),
    setScenarioParameterValue: useStableCallback(setScenarioParameterValue),
    setInitialMarking: useStableCallback(setInitialMarking),
    setParameterValue: useStableCallback(setParameterValue),
    setDt: useStableCallback(setDt),
    setMaxTime: useStableCallback(setMaxTime),
    initialize: useStableCallback(initialize),
    run: useStableCallback(run),
    pause: useStableCallback(pause),
    reset: useStableCallback(reset),
    setBackpressure: useStableCallback(setBackpressure),
    ack: useStableCallback(ack),
  };

  return (
    <SimulationContext.Provider value={contextValue}>
      <SimulationStateNotifier />
      {children}
    </SimulationContext.Provider>
  );
};
