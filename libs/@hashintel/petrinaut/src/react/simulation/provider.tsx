import { use, useEffect, useRef, useState } from "react";

import {
  createSimulation,
  compileScenario,
  type ReadableStore,
  type Scenario,
  type Simulation,
  type SimulationState as CoreSimulationState,
  type WorkerFactory,
  type CompiledScenarioResult,
} from "@hashintel/petrinaut-core";
import { createSimulationWorker } from "@hashintel/petrinaut-core/workers/simulation";

import { deriveDefaultParameterValues } from "../hooks/use-default-parameter-values";
import { useLatest } from "../hooks/use-latest";
import { useStableCallback } from "../hooks/use-stable-callback";
import { LanguageClientContext } from "../lsp/context";
import { NotificationsContext } from "../notifications/context";
import { SDCPNContext } from "../state/sdcpn-context";
import { useStore } from "../use-store";
import {
  type InitialMarking,
  SimulationContext,
  type SimulationContextValue,
  type SimulationFrameReader,
  type SimulationState,
} from "./context";
import {
  migrateInitialMarkingForTypeChanges,
  snapshotTypeElements,
  type TypeElementsSnapshot,
} from "./provider/migrate-initial-marking";

/**
 * Internal state for the simulation provider.
 * Configuration values that aren't managed by the worker.
 */
type SimulationStateValues = {
  parameterValues: Record<string, string>;
  initialMarking: InitialMarking;
  /**
   * `undefined` means "auto-select the model's first scenario".
   * `null` means the user explicitly selected no scenario.
   */
  selectedScenarioId: string | null | undefined;
  /** User-editable scenario parameter values (identifier → string value). */
  scenarioParameterValues: Record<string, string>;
  dt: number;
  maxTime: number | null;
};

function getScenarioParameterDefaults(
  scenario?: Scenario,
): Record<string, string> {
  const values: Record<string, string> = {};

  if (!scenario) {
    return values;
  }

  for (const parameter of scenario.scenarioParameters) {
    values[parameter.identifier] = String(parameter.default);
  }

  return values;
}

function createInitialStateValues(): SimulationStateValues {
  return {
    parameterValues: {},
    initialMarking: {},
    selectedScenarioId: undefined,
    scenarioParameterValues: {},
    dt: 0.01,
    maxTime: null,
  };
}

function getEffectiveSelectedScenarioId(
  scenarios: readonly Scenario[] | undefined,
  selectedScenarioId: string | null | undefined,
): string | null {
  if (selectedScenarioId === null) {
    return null;
  }

  if (
    selectedScenarioId &&
    scenarios?.some((scenario) => scenario.id === selectedScenarioId)
  ) {
    return selectedScenarioId;
  }

  return scenarios?.[0]?.id ?? null;
}

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
  const { requestHirArtifacts } = use(LanguageClientContext);
  const { extensions, petriNetDefinition } = sdcpnContext;
  const { addNotification } = use(NotificationsContext);

  const petriNetDefinitionRef = useLatest(petriNetDefinition);
  const extensionsRef = useLatest(extensions);
  const workerFactoryRef = useLatest(workerFactory ?? createSimulationWorker);

  // Configuration state (not managed by the simulation handle)
  const [stateValues, setStateValues] = useState<SimulationStateValues>(() =>
    createInitialStateValues(),
  );
  const stateValuesRef = useLatest(stateValues);

  // Active simulation handle. Lifecycle is owned by this provider.
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const simulationRef = useLatest(simulation);
  const initializationGenerationRef = useRef(0);
  // Track error info captured from the simulation's events stream so the UI
  // can surface it. The core handle has a status of "Error" but doesn't
  // re-expose the message via stores; events fire once on transition.
  const [error, setError] = useState<string | null>(null);
  const [errorItemId, setErrorItemId] = useState<string | null>(null);

  // Subscribe to the active simulation's stores. EMPTY_*_STORE provides a
  // stable fallback so hook order doesn't change when no sim is active.
  const coreStatus = useStore(simulation?.status ?? EMPTY_STATUS_STORE);
  const frameSummary = useStore(simulation?.frames ?? EMPTY_FRAMES_STORE);

  // When the simulation changes, subscribe to its events stream for errors and
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
        addNotification({
          message: "Simulation complete",
          tone: "success",
        });
      }
    });
    return off;
  }, [addNotification, simulation]);

  // Dispose on unmount.
  useEffect(() => {
    return () => {
      initializationGenerationRef.current += 1;
      simulationRef.current?.dispose();
    };
  }, [simulationRef]);

  // Keep the session initialMarking aligned with colour type schemas: when a
  // type element is renamed, re-typed, or removed, migrate the name-keyed
  // token records held in state (re-key renames, coerce re-typed values,
  // drop stale keys) so stored/displayed values don't silently misalign.
  const previousTypeElementsRef = useRef<TypeElementsSnapshot | null>(null);
  useEffect(() => {
    const previousTypeElements = previousTypeElementsRef.current;
    previousTypeElementsRef.current = snapshotTypeElements(petriNetDefinition);
    if (!previousTypeElements) {
      return;
    }
    const migrated = migrateInitialMarkingForTypeChanges({
      initialMarking: stateValuesRef.current.initialMarking,
      previousTypeElements,
      sdcpn: petriNetDefinition,
    });
    if (migrated) {
      setStateValues((prev) => ({ ...prev, initialMarking: migrated }));
    }
  }, [petriNetDefinition, stateValuesRef]);

  //
  // Actions
  //

  const invalidateSimulationForConfigurationChange = (): void => {
    initializationGenerationRef.current += 1;
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
        const scenario = petriNetDefinition.scenarios?.find(
          (s) => s.id === scenarioId,
        );

        return {
          ...prev,
          selectedScenarioId: scenarioId,
          scenarioParameterValues: getScenarioParameterDefaults(scenario),
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
        selectedScenarioId:
          prev.selectedScenarioId === undefined
            ? getEffectiveSelectedScenarioId(
                petriNetDefinition.scenarios,
                prev.selectedScenarioId,
              )
            : prev.selectedScenarioId,
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
      return {
        ...prev,
        initialMarking: {
          ...prev.initialMarking,
          [placeId]: marking,
        },
      };
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
    const generation = initializationGenerationRef.current + 1;
    initializationGenerationRef.current = generation;
    const currentState = stateValuesRef.current;
    const sdcpn = petriNetDefinitionRef.current;
    const simulationExtensions = extensionsRef.current;
    const simulationSdcpn = simulationExtensions.parameters
      ? sdcpn
      : { ...sdcpn, parameters: [] };
    // Snapshot every compile-sensitive input before awaiting the worker so
    // artifacts and execution always use the same model configuration.
    // eslint-disable-next-line no-use-before-define -- closure; ref is defined later in render
    const initialMarking = effectiveInitialMarkingRef.current;
    // eslint-disable-next-line no-use-before-define -- closure; ref is defined later in render
    const parameterValues = effectiveParameterValuesRef.current;

    // Dispose any active simulation before starting a new one. Update both
    // the ref and React state so same-tick callers see the cleared handle.
    const previous = simulationRef.current;
    if (previous) {
      previous.dispose();
      simulationRef.current = null;
      setSimulation(null);
    }
    setError(null);
    setErrorItemId(null);
    setStateValues((prev) => ({ ...prev, dt }));

    let sim: Simulation;
    try {
      // Compile the net's user code to HIR artifacts in the language worker —
      // the simulation engine has no compiler of its own.
      const { artifacts } = await requestHirArtifacts(
        simulationSdcpn,
        simulationExtensions,
      );
      if (initializationGenerationRef.current !== generation) {
        return;
      }

      sim = await createSimulation({
        sdcpn: simulationSdcpn,
        extensions: simulationExtensions,
        hirArtifacts: artifacts,
        initialMarking,
        parameterValues,
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
      if (initializationGenerationRef.current !== generation) {
        return;
      }
      const message =
        caught instanceof Error
          ? caught.message
          : "Failed to initialize simulation";
      setError(message);
      setErrorItemId(null);
      throw caught;
    }

    if (initializationGenerationRef.current !== generation) {
      sim.dispose();
      return;
    }

    // Write the ref synchronously *before* setSimulation so a same-tick
    // caller can run the newly initialized handle immediately.
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
    initializationGenerationRef.current += 1;
    const sdcpn = petriNetDefinitionRef.current;
    const parameters = extensionsRef.current.parameters ? sdcpn.parameters : [];
    const defaultValues = deriveDefaultParameterValues(parameters);

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
  const effectiveSelectedScenarioId = getEffectiveSelectedScenarioId(
    petriNetDefinition.scenarios,
    stateValues.selectedScenarioId,
  );
  const effectiveScenarioParameterValues =
    stateValues.selectedScenarioId === undefined ||
    stateValues.selectedScenarioId === effectiveSelectedScenarioId
      ? stateValues.scenarioParameterValues
      : {};

  // Compile scenario when one is selected — computed during render.
  // React Compiler will memoize based on inputs.
  let compiledScenarioResult: CompiledScenarioResult | null = null;
  if (effectiveSelectedScenarioId) {
    const selectedScenario = petriNetDefinition.scenarios?.find(
      (s) => s.id === effectiveSelectedScenarioId,
    );
    if (selectedScenario) {
      // Build a scenario with user-tweaked parameter values
      const tweakedScenario = {
        ...selectedScenario,
        scenarioParameters: selectedScenario.scenarioParameters.map((sp) => ({
          ...sp,
          default: Number(
            effectiveScenarioParameterValues[sp.identifier] ?? sp.default,
          ),
        })),
      };
      const outcome = compileScenario(
        tweakedScenario,
        extensions.parameters ? petriNetDefinition.parameters : [],
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
  let effectiveParameterValues = extensions.parameters
    ? stateValues.parameterValues
    : {};
  let effectiveInitialMarking = stateValues.initialMarking;

  if (compiledScenarioResult) {
    effectiveParameterValues = compiledScenarioResult.parameterValues;

    // Merge compiled scenario initial state on top of manual markings.
    effectiveInitialMarking = {
      ...stateValues.initialMarking,
      ...compiledScenarioResult.initialState,
    };
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
    selectedScenarioId: effectiveSelectedScenarioId,
    scenarioParameterValues: effectiveScenarioParameterValues,
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
    </SimulationContext.Provider>
  );
};
