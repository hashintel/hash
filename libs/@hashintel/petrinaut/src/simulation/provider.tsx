import { use, useEffect, useRef, useState } from "react";

import {
  createSimulation,
  type Simulation,
  type SimulationState as CoreSimulationState,
} from "../core/simulation";
import type { ReadableStore } from "../core/handle";
import { useStore } from "../react/use-store";
import { deriveDefaultParameterValues } from "../hooks/use-default-parameter-values";
import { useLatest } from "../hooks/use-latest";
import { useStableCallback } from "../hooks/use-stable-callback";
import { useNotifications } from "../notifications/notifications-context";
import { SDCPNContext } from "../state/sdcpn-context";
import {
  compileScenario,
  type CompiledScenarioResult,
} from "./compile-scenario";
import {
  type InitialMarking,
  SimulationContext,
  type SimulationContextValue,
  type SimulationFrame,
  type SimulationState,
} from "./context";
import { createSimulationWorker } from "./worker/create-simulation-worker";

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

const EMPTY_STATUS_STORE: ReadableStore<CoreSimulationState> = {
  get: () => "Initializing",
  subscribe: () => () => {},
};

const EMPTY_FRAMES_STORE: ReadableStore<{
  count: number;
  latest: SimulationFrame | null;
}> = {
  get: () => ({ count: 0, latest: null }),
  subscribe: () => () => {},
};

/**
 * Map a core {@link CoreSimulationState} to the legacy
 * {@link SimulationState} shape consumed by the editor UI.
 *
 * Returns "NotRun" when no simulation handle is active.
 */
function mapCoreState(status: CoreSimulationState | null): SimulationState {
  if (status === null) {
    return "NotRun";
  }
  switch (status) {
    case "Initializing":
      return "NotRun";
    case "Ready":
      return "Paused";
    case "Running":
      return "Running";
    case "Paused":
      return "Paused";
    case "Complete":
      return "Complete";
    case "Error":
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

  // Configuration state (not managed by the simulation handle)
  const [stateValues, setStateValues] =
    useState<SimulationStateValues>(INITIAL_STATE_VALUES);
  const stateValuesRef = useLatest(stateValues);

  // Active simulation handle. Lifecycle is owned by this provider.
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const simulationRef = useLatest(simulation);

  // Track error info captured from the simulation's events stream so the UI
  // can surface it. The core handle has a status of "Error" but doesn't
  // re-expose the message via stores; events fire once on transition.
  const [error, setError] = useState<string | null>(null);
  const [errorItemId, setErrorItemId] = useState<string | null>(null);

  // Subscribe to the active simulation's stores. EMPTY_*_STORE provides a
  // stable fallback so hook order doesn't change when no sim is active.
  const coreStatus = useStore(simulation?.status ?? EMPTY_STATUS_STORE);
  const frameSummary = useStore(simulation?.frames ?? EMPTY_FRAMES_STORE);

  // When the simulation changes, wire up its events stream for error
  // surfacing and clear stale error state.
  useEffect(() => {
    if (!simulation) {
      return;
    }
    setError(null);
    setErrorItemId(null);
    const off = simulation.events.subscribe((event) => {
      if (event.type === "error") {
        setError(event.message);
        setErrorItemId(event.itemId);
      }
    });
    return off;
  }, [simulation]);

  // Reinitialize when petriNetId changes — drop any active simulation and
  // reset configuration to defaults.
  useEffect(() => {
    setSimulation((prev) => {
      prev?.dispose();
      return null;
    });
    setStateValues(INITIAL_STATE_VALUES);
    setError(null);
    setErrorItemId(null);
  }, [petriNetId]);

  // Dispose on unmount.
  useEffect(() => {
    return () => {
      simulationRef.current?.dispose();
    };
  }, [simulationRef]);

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

  const initialize: SimulationContextValue["initialize"] = async ({
    seed,
    dt,
    maxFramesAhead,
    batchSize,
  }) => {
    const currentState = stateValuesRef.current;
    const sdcpn = petriNetDefinitionRef.current;

    // Dispose any in-flight simulation before starting a new one.
    const previous = simulationRef.current;
    if (previous) {
      previous.dispose();
      setSimulation(null);
    }
    setError(null);
    setErrorItemId(null);

    // Update local dt
    setStateValues((prev) => ({ ...prev, dt }));

    const sim = await createSimulation({
      sdcpn,
      // eslint-disable-next-line no-use-before-define -- closure; ref is defined later in render
      initialMarking: effectiveInitialMarkingRef.current,
      // eslint-disable-next-line no-use-before-define -- closure; ref is defined later in render
      parameterValues: effectiveParameterValuesRef.current,
      seed,
      dt,
      maxTime: currentState.maxTime,
      backpressure:
        maxFramesAhead !== undefined || batchSize !== undefined
          ? { maxFramesAhead, batchSize }
          : undefined,
      createWorker: createSimulationWorker,
    });

    setSimulation(sim);
  };

  const run: SimulationContextValue["run"] = () => {
    simulationRef.current?.run();
  };

  const pause: SimulationContextValue["pause"] = () => {
    simulationRef.current?.pause();
  };

  const reset: SimulationContextValue["reset"] = () => {
    const sdcpn = petriNetDefinitionRef.current;
    const defaultValues = deriveDefaultParameterValues(sdcpn.parameters);

    const parameterValues: Record<string, string> = {};
    for (const [key, value] of Object.entries(defaultValues)) {
      parameterValues[key] = String(value);
    }

    setSimulation((prev) => {
      prev?.dispose();
      return null;
    });
    setError(null);
    setErrorItemId(null);

    setStateValues((prev) => ({
      ...prev,
      parameterValues,
      // Keep initialMarking when resetting - it's configuration, not simulation state
    }));
  };

  const setBackpressure: SimulationContextValue["setBackpressure"] = (
    params,
  ) => {
    simulationRef.current?.setBackpressure(params);
  };

  const ack: SimulationContextValue["ack"] = (frameNumber) => {
    simulationRef.current?.ack(frameNumber);
  };

  // Frame access — reads from the active simulation handle.
  const getFrame: SimulationContextValue["getFrame"] = (
    frameIndex: number,
  ): Promise<SimulationFrame | null> => {
    const sim = simulationRef.current;
    if (!sim) {
      return Promise.resolve(null);
    }
    return Promise.resolve(sim.getFrame(frameIndex));
  };

  const getAllFrames: SimulationContextValue["getAllFrames"] = () => {
    const sim = simulationRef.current;
    if (!sim) {
      return Promise.resolve([]);
    }
    const all: SimulationFrame[] = [];
    const total = sim.frames.get().count;
    for (let i = 0; i < total; i++) {
      const frame = sim.getFrame(i);
      if (frame) {
        all.push(frame);
      }
    }
    return Promise.resolve(all);
  };

  const getFramesInRange: SimulationContextValue["getFramesInRange"] = (
    startIndex: number,
    endIndex?: number,
  ) => {
    const sim = simulationRef.current;
    if (!sim) {
      return Promise.resolve([]);
    }
    const total = sim.frames.get().count;
    const start = Math.max(0, startIndex);
    const end = endIndex === undefined ? total : Math.min(endIndex, total);
    const slice: SimulationFrame[] = [];
    for (let i = start; i < end; i++) {
      const frame = sim.getFrame(i);
      if (frame) {
        slice.push(frame);
      }
    }
    return Promise.resolve(slice);
  };

  const simulationState = mapCoreState(simulation ? coreStatus : null);
  const totalFrames = frameSummary.count;

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
    error,
    errorItemId,
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
