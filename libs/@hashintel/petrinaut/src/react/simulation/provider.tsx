import { use, useEffect, useRef, useState } from "react";

import type { ReadableStore } from "../../core/handle";
import {
  createSimulation,
  type Simulation,
  type SimulationState as CoreSimulationState,
  type WorkerFactory,
} from "../../core/simulation";
import {
  compileScenario,
  type CompiledScenarioResult,
} from "../../core/simulation/authoring/compile-scenario";
import { createSimulationWorker } from "../../core/simulation/worker/create-simulation-worker";
import { deriveDefaultParameterValues } from "../hooks/use-default-parameter-values";
import { useLatest } from "../hooks/use-latest";
import { useStableCallback } from "../hooks/use-stable-callback";
import { SDCPNContext } from "../state/sdcpn-context";
import { useStore } from "../use-store";
import { SimulationToaster, type SimulationToast } from "./toaster";
import {
  type InitialMarking,
  SimulationContext,
  type SimulationContextValue,
  type SimulationFrameReader,
  type SimulationState,
} from "./context";

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

/**
 * Stable empty frame summary. Sharing the same object across `get()` calls
 * is critical for `useSyncExternalStore` — returning a fresh object on each
 * read triggers an infinite re-render loop.
 */
const EMPTY_FRAME_SUMMARY: {
  count: number;
  latest: SimulationFrameReader | null;
} = { count: 0, latest: null };

const EMPTY_FRAMES_STORE: ReadableStore<typeof EMPTY_FRAME_SUMMARY> = {
  get: () => EMPTY_FRAME_SUMMARY,
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

const TOAST_DURATION_MS = 3000;
const TOAST_FADE_OUT_MS = 200;

type SimulationProviderProps = React.PropsWithChildren<{
  /**
   * Factory that produces the simulation worker. Hosts can plug in their own
   * worker bundling — e.g. via Vite's `?worker` directive against the package
   * sub-entry — instead of relying on the inlined-blob worker that ships with
   * the library. When omitted, falls back to `createSimulationWorker` (which
   * uses `?worker&inline` against the worker source) — fine for the storybook
   * dev server and for consumers that bundle the package from source, but can
   * fail in cases where the host bundler doesn't re-process the inlined
   * blob URL (e.g. some production builds against the dist output).
   */
  workerFactory?: WorkerFactory;
}>;

export const SimulationProvider: React.FC<SimulationProviderProps> = ({
  children,
  workerFactory,
}) => {
  const sdcpnContext = use(SDCPNContext);
  const { petriNetDefinition } = sdcpnContext;

  const petriNetDefinitionRef = useLatest(petriNetDefinition);
  const workerFactoryRef = useLatest(workerFactory ?? createSimulationWorker);

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

  // Transient toasts surfaced from the simulation events stream. Replaces the
  // old standalone `<NotificationsProvider>` system — see Q7 in
  // 07-open-questions.md.
  const [toasts, setToasts] = useState<SimulationToast[]>([]);
  const nextToastIdRef = useRef(0);

  // Subscribe to the active simulation's stores. EMPTY_*_STORE provides a
  // stable fallback so hook order doesn't change when no sim is active.
  const coreStatus = useStore(simulation?.status ?? EMPTY_STATUS_STORE);
  const frameSummary = useStore(simulation?.frames ?? EMPTY_FRAMES_STORE);

  // When the simulation changes, wire up its events stream for errors and
  // completion notifications.
  useEffect(() => {
    if (!simulation) {
      return;
    }
    const off = simulation.events.subscribe((event) => {
      if (event.type === "error") {
        setError(event.message);
        setErrorItemId(event.itemId);
      } else {
        const id = nextToastIdRef.current++;
        setToasts((prev) => [
          ...prev,
          { id, message: "Simulation complete", exiting: false },
        ]);
        // Start exit animation just before removal.
        setTimeout(() => {
          setToasts((prev) =>
            prev.map((toast) =>
              toast.id === id ? { ...toast, exiting: true } : toast,
            ),
          );
        }, TOAST_DURATION_MS - TOAST_FADE_OUT_MS);
        // Remove once the exit animation finishes.
        setTimeout(() => {
          setToasts((prev) => prev.filter((toast) => toast.id !== id));
        }, TOAST_DURATION_MS);
      }
    });
    return off;
  }, [simulation]);

  // Dispose on unmount.
  useEffect(() => {
    return () => {
      simulationRef.current?.dispose();
    };
  }, [simulationRef]);

  //
  // Actions
  //

  const invalidateSimulationForConfigurationChange = (): void => {
    const current = simulationRef.current;
    if (!current) {
      return;
    }

    current.dispose();
    simulationRef.current = null;
    setSimulation(null);
    setError(null);
    setErrorItemId(null);
  };

  const setSelectedScenarioId: SimulationContextValue["setSelectedScenarioId"] =
    (scenarioId) => {
      if (stateValuesRef.current.selectedScenarioId !== scenarioId) {
        invalidateSimulationForConfigurationChange();
      }

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
      if (
        stateValuesRef.current.scenarioParameterValues[identifier] !== value
      ) {
        invalidateSimulationForConfigurationChange();
      }

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
    invalidateSimulationForConfigurationChange();

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
    if (stateValuesRef.current.parameterValues[parameterId] !== value) {
      invalidateSimulationForConfigurationChange();
    }

    setStateValues((prev) => ({
      ...prev,
      parameterValues: {
        ...prev.parameterValues,
        [parameterId]: value,
      },
    }));
  };

  const setDt: SimulationContextValue["setDt"] = (dt) => {
    if (stateValuesRef.current.dt !== dt) {
      invalidateSimulationForConfigurationChange();
    }

    setStateValues((prev) => ({ ...prev, dt }));
  };

  const setMaxTime: SimulationContextValue["setMaxTime"] = (maxTime) => {
    if (stateValuesRef.current.maxTime !== maxTime) {
      invalidateSimulationForConfigurationChange();
    }

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

    // Dispose any in-flight simulation before starting a new one. Update both
    // the ref (synchronous, so callers in the same tick see `null` not the
    // disposed handle) and the React state (so subscribers re-render).
    const previous = simulationRef.current;
    if (previous) {
      previous.dispose();
      simulationRef.current = null;
      setSimulation(null);
    }
    setError(null);
    setErrorItemId(null);

    // Update local dt
    setStateValues((prev) => ({ ...prev, dt }));

    let sim: Simulation;
    try {
      sim = await createSimulation({
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
        createWorker: workerFactoryRef.current,
      });
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Failed to initialize simulation";
      setError(message);
      setErrorItemId(null);
      throw caught;
    }

    // Write the ref synchronously *before* setSimulation so a same-tick
    // caller (e.g. PlaybackProvider's `play()` chains `runSimulation()`
    // immediately after `await initialize(...)`) sees the new handle.
    // setSimulation also schedules a re-render so useStore subscribers
    // pick up the new stores.
    simulationRef.current = sim;
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

    simulationRef.current?.dispose();
    simulationRef.current = null;
    setSimulation(null);
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
  ): Promise<SimulationFrameReader | null> => {
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
    const all: SimulationFrameReader[] = [];
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
    const slice: SimulationFrameReader[] = [];
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
      {children}
      <SimulationToaster toasts={toasts} />
    </SimulationContext.Provider>
  );
};
