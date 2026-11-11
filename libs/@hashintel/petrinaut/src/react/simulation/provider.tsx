/**
 * @layerRoot react.simulation
 * @role Owns the run configuration, starts runs and experiments on the selected simulator, and mirrors their handles into React
 */

import { use, useEffect, useRef, useState } from "react";

import {
  assessSimulator,
  createExperimentReader,
  DEFAULT_EXPERIMENT_SAMPLE_PERIOD,
  placeCountMetricSpecs,
  simulatorSamplePeriod,
  compileScenario,
  synthesizeAdHocScenario,
  type AdHocScenarioState,
  type AdHocSynthesisContext,
  type EventSimulation,
  type CompileHirArtifactsOptions,
  type HirCompileResult,
  type MonteCarloExperiment,
  type MonteCarloExperimentState,
  type PetrinautExtensionSettings,
  type ReadableStore,
  type Scenario,
  type ScenarioCompilationError,
  type ScenarioHir,
  type ScenarioLoweringInput,
  type SDCPN,
  type SimulationRequestBase,
  type SimulationState as CoreSimulationState,
  type SimulatorExperimentRequest,
  type SimulatorRegistration,
  type SimulatorStart,
  type CompiledScenarioResult,
} from "@hashintel/petrinaut-core";

import { deriveDefaultParameterValues } from "../hooks/use-default-parameter-values";
import { useLatest } from "../hooks/use-latest";
import { useStableCallback } from "../hooks/use-stable-callback";
import { LanguageClientContext } from "../lsp/context";
import { usePetrinautNavigation } from "../navigation";
import { resolveNavigatedId } from "../navigation/resolve-navigated-ids";
import { NotificationsContext } from "../notifications/context";
import {
  findSimulator,
  SimulatorsContext,
  type SimulationMode,
  type SimulatorSelection,
} from "../simulators/context";
import { SDCPNContext } from "../state/sdcpn-context";
import { constantStore, selectStore, useStore } from "../use-store";
import {
  type InitialMarking,
  type PlaybackSource,
  type StochasticRun,
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
import {
  simulatorParametersKey,
  simulatorSelectionIn,
  type SimulatorChoices,
} from "./provider/simulator-selection";
import { useScenarioHir } from "./use-scenario-hir";

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
  /** Inline definition used when no scenario is selected; never persisted. */
  adHocScenario: AdHocScenarioState | null;
  maxTime: number | null;
  mode: SimulationMode;
  /** Runs a Stochastic simulation computes. */
  runs: number;
} & SimulatorChoices;

/** Runs a Stochastic simulation starts on. */
const DEFAULT_STOCHASTIC_RUNS = 100;
/** The end time a Stochastic simulation takes when none was set. */
const DEFAULT_STOCHASTIC_MAX_TIME = 60;

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

function createInitialStateValues(options?: {
  maxTime?: number | null;
  selectedScenarioId?: string | null;
}): SimulationStateValues {
  return {
    parameterValues: {},
    initialMarking: {},
    selectedScenarioId: options?.selectedScenarioId,
    scenarioParameterValues: {},
    adHocScenario: null,
    maxTime: options?.maxTime ?? null,
    mode: "quick",
    runs: DEFAULT_STOCHASTIC_RUNS,
    simulatorIds: { quick: null, stochastic: null },
    simulatorParameters: {},
  };
}

/**
 * Whether the requested scenario has to be rewritten to the one in effect.
 *
 * A host that requires a scenario normalizes an absent or stale request, so a
 * URL without one resolves to a real scenario. A host that does not require
 * one normalizes only a stale request, so an explicit no-scenario choice
 * survives instead of snapping back to the first scenario.
 */
export function shouldNormalizeScenarioSelection({
  effectiveSelectedScenarioId,
  requestedScenarioId,
  requireScenario = false,
}: {
  effectiveSelectedScenarioId: string | null;
  requestedScenarioId: string | null | undefined;
  requireScenario?: boolean;
}): boolean {
  if (requireScenario) {
    return (
      effectiveSelectedScenarioId !== null &&
      requestedScenarioId !== effectiveSelectedScenarioId
    );
  }

  return (
    requestedScenarioId !== undefined &&
    requestedScenarioId !== null &&
    requestedScenarioId !== effectiveSelectedScenarioId
  );
}

/** The requested scenario resolved through `toPetrinautId`, else the first scenario unless none is allowed. */
export function getEffectiveSelectedScenarioId(
  scenarios: readonly Scenario[] | undefined,
  selectedScenarioId: string | null | undefined,
  requireScenario = false,
): string | null {
  if (selectedScenarioId === null && !requireScenario) {
    return null;
  }

  const resolvedScenarioId = selectedScenarioId
    ? resolveNavigatedId(scenarios, selectedScenarioId)
    : null;

  return resolvedScenarioId ?? scenarios?.[0]?.id ?? null;
}

/** A refusal's reasons as one message, the way a failed start reports. */
const refusalMessage = (
  blockers: readonly { readonly message: string }[],
): string => blockers.map((blocker) => blocker.message).join("\n");

/**
 * The handle, releasing what was loaded for it once it is disposed: whoever
 * ends the run or the experiment ends the simulator's hold with it.
 */
const releasingOnDispose = <Handle extends { dispose(this: void): void }>(
  handle: Handle,
  release: () => void,
): Handle => ({
  ...handle,
  dispose: () => {
    handle.dispose();
    release();
  },
});

/**
 * The selected simulator's offer for the request, or throws why there is
 * none. This and the two starts below live outside `initialize`: a `throw`
 * inside that function's `try`/`catch` is syntax React Compiler does not
 * lower.
 */
const assessOrThrow = async (
  registration: SimulatorRegistration | undefined,
  selection: SimulatorSelection,
  request: Parameters<typeof assessSimulator>[2],
) => {
  if (!registration) {
    throw new Error(`No simulator is registered as "${selection.simulatorId}"`);
  }
  const outcome = await assessSimulator(
    registration,
    selection.parameters,
    request,
  );
  if (!outcome.ok) {
    throw new Error(refusalMessage(outcome.blockers));
  }
  return { offer: outcome.offer, dispose: outcome.dispose, registration };
};

/**
 * What a start of the offer produced, or throws why it produced nothing.
 * The simulator loaded for the offer is released with the handle, or at
 * once when nothing started.
 */
const startedOrThrow = async <Handle extends { dispose(this: void): void }>(
  release: () => void,
  start: (() => Promise<SimulatorStart<Handle>>) | undefined,
  notOffered: string,
): Promise<Handle> => {
  if (!start) {
    release();
    throw new Error(notOffered);
  }
  let started: SimulatorStart<Handle>;
  try {
    // A start may throw before it returns its promise, as well as reject.
    started = await start();
  } catch (error) {
    release();
    throw error;
  }
  if (!started.ok) {
    release();
    throw new Error(refusalMessage(started.blockers));
  }
  return releasingOnDispose(started.handle, release);
};

/** Starts one run on the selected simulator, or throws why it could not. */
const startSimulatorRun = async (
  registration: SimulatorRegistration | undefined,
  selection: SimulatorSelection,
  request: Parameters<typeof assessSimulator>[2],
): Promise<EventSimulation> => {
  const assessed = await assessOrThrow(registration, selection, request);
  return startedOrThrow(
    assessed.dispose,
    assessed.offer.startRun,
    `${assessed.registration.label} computes many runs at once, not a single run`,
  );
};

/**
 * Stops a start that a change of configuration overtook while the net was
 * compiling, before a worker is spawned for it.
 */
const throwIfSuperseded = (superseded: boolean): void => {
  if (superseded) {
    const error = new Error("The simulation start was superseded");
    error.name = "AbortError";
    throw error;
  }
};

/** Ends a run, and an experiment that nothing else took over. */
const disposeHandles = (
  eventSimulation: EventSimulation | null,
  stochastic: { run: StochasticRun } | null,
): void => {
  eventSimulation?.dispose();
  // Disposing an experiment ends its workers, running or not. One that was
  // kept is its new owner's to end.
  if (stochastic && !stochastic.run.kept) {
    stochastic.run.experiment.dispose();
  }
};

/**
 * The end time in effect. Many runs are compared at the same times, so a
 * Stochastic simulation always has one.
 */
const maxTimeIn = (mode: SimulationMode, maxTime: number | null) =>
  maxTime ?? (mode === "stochastic" ? DEFAULT_STOCHASTIC_MAX_TIME : null);

const ZERO_FRAMES_STORE = constantStore(0);

const EMPTY_STATUS_STORE = constantStore<CoreSimulationState>("Initializing");

/**
 * The editor's lifecycle state for a core {@link CoreSimulationState}:
 * "NotRun" without a handle and while one initializes, "Paused" once it is
 * ready.
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

const experimentStatusAsRunStatus = (
  status: MonteCarloExperimentState,
): CoreSimulationState =>
  // A cancelled experiment is over, with what it computed still to view.
  status === "Cancelled" ? "Complete" : status;

/**
 * What playback moves over in Stochastic mode: the experiment's samples. It
 * computes freely, so nothing is demanded of it.
 */
const createStochasticPlaybackSource = ({
  experiment,
  reader,
}: Pick<StochasticRun, "experiment" | "reader">): PlaybackSource => {
  const read = () => ({
    eventCount: experiment.metrics.get().frames.length,
    coveredTime: reader.coveredTime(),
  });
  // The same object while nothing moved, as a store's value has to be.
  let coverage = read();
  const getCoverage = () => {
    const next = read();
    if (
      next.eventCount !== coverage.eventCount ||
      next.coveredTime !== coverage.coveredTime
    ) {
      coverage = next;
    }
    return coverage;
  };
  return {
    coverage: {
      get: getCoverage,
      subscribe: (listener) =>
        experiment.metrics.subscribe(() => listener(getCoverage())),
    },
    status: {
      get: () => experimentStatusAsRunStatus(experiment.status.get()),
      subscribe: (listener) =>
        experiment.status.subscribe((status) =>
          listener(experimentStatusAsRunStatus(status)),
        ),
    },
    demand: () => {},
  };
};

/** Starts an experiment on the selected simulator, or throws why it could not. */
const startSimulatorExperiment = async (
  registration: SimulatorRegistration | undefined,
  selection: SimulatorSelection,
  request: Parameters<typeof assessSimulator>[2],
  experiment: SimulatorExperimentRequest,
): Promise<MonteCarloExperiment> => {
  const assessed = await assessOrThrow(registration, selection, request);
  const { startExperiment } = assessed.offer;
  return startedOrThrow(
    assessed.dispose,
    startExperiment ? () => startExperiment(experiment) : undefined,
    `${assessed.registration.label} computes one run at a time, not many`,
  );
};

/** Compilation surface consumed by simulation without coupling it to an LSP. */
export type SimulationCompiler = {
  requestHirArtifacts: (
    sdcpn: SDCPN,
    extensions?: PetrinautExtensionSettings,
    options?: CompileHirArtifactsOptions,
  ) => Promise<HirCompileResult>;
  requestScenarioHir: (
    scenario: ScenarioLoweringInput,
    /** The net context an `adhoc` initial state synthesizes against. */
    adHocContext?: AdHocSynthesisContext,
    /** Lets a host with precompiled artifacts look the scenario up. */
    scenarioId?: string,
  ) => Promise<ScenarioHir>;
};

export type SimulationProviderProps = React.PropsWithChildren<{
  /**
   * Optional compiler override. The Preview supplies build-time artifacts so
   * it can reuse the simulation/playback providers without mounting an LSP.
   */
  compiler?: SimulationCompiler;
  initialConfiguration?: {
    maxTime?: number | null;
  };
  /**
   * Require one of the model's named scenarios. Missing, explicit-none, and
   * stale selections resolve to the first scenario and are normalized back
   * through controlled navigation. The full editor keeps this disabled so
   * its existing "No scenario" workflow is unchanged.
   */
  requireScenario?: boolean;
}>;

/**
 * Compiles a run's scenario, or throws its errors as one message. Kept out
 * of `initialize`: a `throw` inside that function's `try`/`catch` is syntax
 * React Compiler does not lower, and the one statement excluded the whole
 * provider from compilation — every render then rebuilt every derived value
 * and re-rendered every consumer of the simulation context, the canvas
 * included.
 */
const compileScenarioForRun = (
  ...args: Parameters<typeof compileScenario>
): CompiledScenarioResult => {
  const outcome = compileScenario(...args);
  if (!outcome.ok) {
    throw new Error(
      outcome.errors.map((scenarioError) => scenarioError.message).join("\n"),
    );
  }
  return outcome.result;
};

export const SimulationProvider: React.FC<SimulationProviderProps> = ({
  children,
  compiler,
  initialConfiguration,
  requireScenario = false,
}) => {
  const sdcpnContext = use(SDCPNContext);
  const languageClient = use(LanguageClientContext);
  // The language client satisfies the compiler surface as is: it ignores the
  // scenario id that hosts with precompiled artifacts key their lookups by.
  const activeCompiler: SimulationCompiler = compiler ?? languageClient;
  const { requestHirArtifacts, requestScenarioHir } = activeCompiler;
  const navigation = usePetrinautNavigation();
  const { extensions, petriNetDefinition } = sdcpnContext;
  const { addNotification } = use(NotificationsContext);

  const petriNetDefinitionRef = useLatest(petriNetDefinition);
  const extensionsRef = useLatest(extensions);
  const simulators = use(SimulatorsContext);
  const simulatorsRef = useLatest(simulators);
  const requestedScenarioId = navigation.state.scenarioId;
  const effectiveSelectedScenarioId = getEffectiveSelectedScenarioId(
    petriNetDefinition.scenarios,
    requestedScenarioId,
    requireScenario,
  );

  // Configuration state (not managed by the simulation handle)
  const [stateValues, setStateValues] = useState<SimulationStateValues>(() =>
    createInitialStateValues({
      ...initialConfiguration,
      selectedScenarioId: navigation.state.scenarioId,
    }),
  );
  const stateValuesRef = useLatest(stateValues);

  const { mode } = stateValues;
  const simulatorSelection = simulatorSelectionIn(
    mode,
    stateValues,
    simulators,
  );
  const simulatorSelectionRef = useLatest(simulatorSelection);

  // A Quick Simulation's run. Its lifecycle is owned by this provider, and at
  // most one of it and the Stochastic experiment below is live.
  const [eventSimulation, setEventSimulation] =
    useState<EventSimulation | null>(null);
  const eventSimulationRef = useLatest(eventSimulation);
  // A Stochastic simulation's experiment, with the source playback moves
  // over made once beside it.
  const [stochastic, setStochastic] = useState<{
    run: StochasticRun;
    playbackSource: PlaybackSource;
  } | null>(null);
  const stochasticRef = useLatest(stochastic);
  const initializationGenerationRef = useRef(0);
  // Track error info captured from the simulation's events stream so the UI
  // can surface it. The core handle has a status of "Error" but doesn't
  // re-expose the message via stores; events fire once on transition.
  const [error, setError] = useState<string | null>(null);
  const [errorItemId, setErrorItemId] = useState<string | null>(null);

  // Subscribe to the active simulation's stores. EMPTY_*_STORE provides a
  // stable fallback so hook order doesn't change when no sim is active.
  const coreStatus = useStore(
    eventSimulation?.status ??
      stochastic?.playbackSource.status ??
      EMPTY_STATUS_STORE,
  );

  // When the simulation changes, subscribe to its events stream for errors and
  // completion notifications.
  useEffect(() => {
    if (!eventSimulation) {
      return;
    }
    const off = eventSimulation.events.subscribe((event) => {
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
  }, [addNotification, eventSimulation]);

  // An experiment reports the same two things on its own stream.
  useEffect(() => {
    if (!stochastic) {
      return;
    }
    return stochastic.run.experiment.events.subscribe((event) => {
      if (event.type === "error") {
        setError(event.message);
        setErrorItemId(event.itemId);
      } else if (event.type === "complete" && !stochastic.run.kept) {
        // A kept experiment's completion is reported by its new owner.
        addNotification({ message: "Simulation complete", tone: "success" });
      }
    });
  }, [addNotification, stochastic]);

  // Dispose on unmount.
  useEffect(() => {
    return () => {
      initializationGenerationRef.current += 1;
      disposeHandles(eventSimulationRef.current, stochasticRef.current);
    };
  }, [eventSimulationRef, stochasticRef]);

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

  /** Tears down whichever run is live and clears its handle, synchronously. */
  const disposeRuns = (): boolean => {
    const currentEvent = eventSimulationRef.current;
    const currentStochastic = stochasticRef.current;
    disposeHandles(currentEvent, currentStochastic);
    eventSimulationRef.current = null;
    stochasticRef.current = null;
    if (currentEvent) {
      setEventSimulation(null);
    }
    if (currentStochastic) {
      setStochastic(null);
    }
    return currentEvent !== null || currentStochastic !== null;
  };

  const invalidateSimulationForConfigurationChange = (): void => {
    initializationGenerationRef.current += 1;
    disposeRuns();
    // Also without a run: a refused start leaves its reason behind, and the
    // change may be what answers it.
    setError(null);
    setErrorItemId(null);
  };

  const previousEffectiveScenarioIdRef = useRef(effectiveSelectedScenarioId);
  useEffect(() => {
    if (
      previousEffectiveScenarioIdRef.current === effectiveSelectedScenarioId
    ) {
      return;
    }
    previousEffectiveScenarioIdRef.current = effectiveSelectedScenarioId;

    initializationGenerationRef.current += 1;
    disposeHandles(eventSimulationRef.current, stochasticRef.current);
    eventSimulationRef.current = null;
    stochasticRef.current = null;
    // Reacting to a scenario switch from navigation: the running simulation is disposed here, and the resets run once per switch behind the previous-id guard above.
    setEventSimulation(null);
    setStochastic(null);
    setError(null);
    setErrorItemId(null);
    setStateValues((prev) => ({
      ...prev,
      selectedScenarioId: effectiveSelectedScenarioId,
      scenarioParameterValues: getScenarioParameterDefaults(
        petriNetDefinition.scenarios?.find(
          (scenario) => scenario.id === effectiveSelectedScenarioId,
        ),
      ),
    }));
  }, [
    effectiveSelectedScenarioId,
    eventSimulationRef,
    petriNetDefinition.scenarios,
    stochasticRef,
  ]);

  // Only navigates. The effective-scenario effect above owns the simulation
  // disposal and parameter-default reset, so a user-initiated switch and a
  // host- or history-initiated one take the same path — and a controlled host
  // that declines the navigation keeps its running simulation untouched.
  const setSelectedScenarioId: SimulationContextValue["setSelectedScenarioId"] =
    (scenarioId) => {
      navigation.navigate(
        { scenarioId },
        { cause: "user", action: "scenario" },
      );
    };

  const setAdHocScenario: SimulationContextValue["setAdHocScenario"] = (
    adHocScenario,
  ) => {
    if (stateValuesRef.current.adHocScenario !== adHocScenario) {
      invalidateSimulationForConfigurationChange();
    }
    setStateValues((prev) => ({ ...prev, adHocScenario }));
  };

  const setScenarioParameterValue: SimulationContextValue["setScenarioParameterValue"] =
    (identifier, value) => {
      if (
        stateValuesRef.current.scenarioParameterValues[identifier] !== value
      ) {
        invalidateSimulationForConfigurationChange();
      }

      if (
        requestedScenarioId === undefined &&
        effectiveSelectedScenarioId !== null
      ) {
        navigation.navigate(
          { scenarioId: effectiveSelectedScenarioId },
          { cause: "normalization", action: "scenario" },
        );
      }

      setStateValues((prev) => ({
        ...prev,
        selectedScenarioId:
          requestedScenarioId === undefined
            ? effectiveSelectedScenarioId
            : requestedScenarioId,
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

  const setMaxTime: SimulationContextValue["setMaxTime"] = (maxTime) => {
    if (stateValuesRef.current.maxTime !== maxTime) {
      invalidateSimulationForConfigurationChange();
    }

    setStateValues((prev) => ({ ...prev, maxTime }));
  };

  const selectSimulator: SimulationContextValue["selectSimulator"] = (
    simulatorId,
  ) => {
    if (simulatorSelectionRef.current.simulatorId !== simulatorId) {
      invalidateSimulationForConfigurationChange();
    }

    setStateValues((prev) => ({
      ...prev,
      simulatorIds: { ...prev.simulatorIds, [prev.mode]: simulatorId },
    }));
  };

  const setMode: SimulationContextValue["setMode"] = (nextMode) => {
    if (stateValuesRef.current.mode !== nextMode) {
      invalidateSimulationForConfigurationChange();
    }

    setStateValues((prev) => ({ ...prev, mode: nextMode }));
  };

  const setRuns: SimulationContextValue["setRuns"] = (runs) => {
    if (!Number.isInteger(runs) || runs < 1) {
      return;
    }
    if (stateValuesRef.current.runs !== runs) {
      invalidateSimulationForConfigurationChange();
    }

    setStateValues((prev) => ({ ...prev, runs }));
  };

  const keepStochasticRun: SimulationContextValue["keepStochasticRun"] = () => {
    const current = stochasticRef.current;
    if (!current || current.run.kept) {
      return null;
    }
    const kept = { ...current, run: { ...current.run, kept: true } };
    stochasticRef.current = kept;
    setStochastic(kept);

    const { experiment } = current.run;
    return releasingOnDispose(experiment, () => {
      const status = experiment.status.get();
      const isOver =
        status === "Complete" || status === "Error" || status === "Cancelled";
      // Disposed before it finished, it will never report an end: the canvas
      // lets go of it rather than wait. One that finished stays in view.
      if (!isOver && stochasticRef.current?.run.experiment === experiment) {
        stochasticRef.current = null;
        setStochastic(null);
      }
    });
  };

  const setSimulatorParameter: SimulationContextValue["setSimulatorParameter"] =
    (key, value) => {
      const { simulatorId, parameters } = simulatorSelectionRef.current;
      if (parameters[key] !== value) {
        invalidateSimulationForConfigurationChange();
      }

      setStateValues((prev) => {
        const parametersKey = simulatorParametersKey(prev.mode, simulatorId);
        return {
          ...prev,
          simulatorParameters: {
            ...prev.simulatorParameters,
            [parametersKey]: {
              ...prev.simulatorParameters[parametersKey],
              [key]: value,
            },
          },
        };
      });
    };

  const initialize: SimulationContextValue["initialize"] = async ({ seed }) => {
    const generation = initializationGenerationRef.current + 1;
    initializationGenerationRef.current = generation;
    const currentState = stateValuesRef.current;
    const maxTime = maxTimeIn(currentState.mode, currentState.maxTime);
    const sdcpn = petriNetDefinitionRef.current;
    const simulationExtensions = extensionsRef.current;
    const simulationSdcpn = simulationExtensions.parameters
      ? sdcpn
      : { ...sdcpn, parameters: [] };
    // Snapshot every compile-sensitive input before awaiting the worker so
    // artifacts and execution always use the same model configuration. The
    // scenario is compiled below rather than read from render state: the
    // render path lowers asynchronously, and a run started while that
    // request is in flight must not fall back to manual values.
    const manualInitialMarking = currentState.initialMarking;
    const manualParameterValues = simulationExtensions.parameters
      ? currentState.parameterValues
      : {};
    // eslint-disable-next-line no-use-before-define -- closure; ref is defined later in render
    const scenarioToCompile = scenarioToCompileRef.current;

    // Refused before anything is torn down: a definition that does not
    // compile leaves the run that is already going, and only reports.
    if (scenarioToCompile?.kind === "invalid") {
      const refusal = new Error(
        `The inline initial state does not compile:\n${scenarioToCompile.messages.join("\n")}`,
      );
      setError(refusal.message);
      setErrorItemId(null);
      throw refusal;
    }

    // Dispose any active simulation before starting a new one. Update both
    // the ref and React state so same-tick callers see the cleared handle.
    disposeRuns();
    setError(null);
    setErrorItemId(null);

    let eventSim: EventSimulation | null = null;
    let stochasticRun: StochasticRun | null = null;
    try {
      let initialMarking = manualInitialMarking;
      let parameterValues: Record<string, string> = manualParameterValues;
      if (scenarioToCompile) {
        const scenarioHir = await requestScenarioHir(
          {
            parameterOverrides: scenarioToCompile.scenario.parameterOverrides,
            initialState: scenarioToCompile.scenario.initialState,
          },
          // A persisted ad-hoc scenario synthesizes against the net inside
          // the worker; other kinds ignore the context.
          {
            netParameters: simulationExtensions.parameters
              ? sdcpn.parameters
              : [],
            places: sdcpn.places,
            types: sdcpn.types,
          },
          scenarioToCompile.scenario.id,
        );
        if (initializationGenerationRef.current !== generation) {
          return false;
        }
        const compiled = compileScenarioForRun(
          scenarioToCompile.scenario,
          scenarioHir,
          scenarioToCompile.netParameters,
          sdcpn.places,
          sdcpn.types,
        );
        parameterValues = compiled.parameterValues;
        initialMarking = {
          ...manualInitialMarking,
          ...compiled.initialState,
        };
      }

      const selection = simulatorSelectionRef.current;
      const registration = findSimulator(
        simulatorsRef.current.registrations,
        selection.simulatorId,
      );
      // Compile the net's user code to HIR artifacts in the language
      // worker: a simulator has no compiler of its own. One that reads
      // the HIR trees itself gets them; the rest are spared the weight.
      const buildRequest = async (simulator: {
        needsHirTrees: boolean;
      }): Promise<SimulationRequestBase> => {
        const { artifacts } = await requestHirArtifacts(
          simulationSdcpn,
          simulationExtensions,
          simulator.needsHirTrees ? { includeHir: true } : undefined,
        );
        throwIfSuperseded(initializationGenerationRef.current !== generation);
        return {
          sdcpn: simulationSdcpn,
          extensions: simulationExtensions,
          hirArtifacts: artifacts,
          initialMarking,
          parameterValues,
          seed,
          maxTime,
        };
      };
      if (currentState.mode === "stochastic") {
        const metricSpecs = placeCountMetricSpecs(simulationSdcpn.places);
        // Named to the simulator rather than left to it, so the samples are
        // spaced as playback and a kept experiment say they are.
        const samplePeriod =
          (registration
            ? simulatorSamplePeriod(registration, selection.parameters)
            : null) ?? DEFAULT_EXPERIMENT_SAMPLE_PERIOD;
        const experiment = await startSimulatorExperiment(
          registration,
          selection,
          buildRequest,
          { runCount: currentState.runs, metricSpecs, samplePeriod },
        );
        stochasticRun = {
          experiment,
          reader: createExperimentReader(experiment.metrics),
          runCount: currentState.runs,
          seed,
          // An experiment without an end is refused before it starts.
          maxTime: maxTime ?? 0,
          samplePeriod,
          metricSpecs,
          simulator: selection,
          kept: false,
        };
      } else {
        eventSim = await startSimulatorRun(
          registration,
          selection,
          buildRequest,
        );
      }
    } catch (caught) {
      if (initializationGenerationRef.current !== generation) {
        return false;
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
      eventSim?.dispose();
      stochasticRun?.experiment.dispose();
      return false;
    }

    const nextStochastic = stochasticRun
      ? {
          run: stochasticRun,
          playbackSource: createStochasticPlaybackSource(stochasticRun),
        }
      : null;
    // Write the refs synchronously *before* the state so a same-tick caller
    // can run the newly initialized handle immediately.
    eventSimulationRef.current = eventSim;
    stochasticRef.current = nextStochastic;
    setEventSimulation(eventSim);
    setStochastic(nextStochastic);
    return true;
  };

  const run: SimulationContextValue["run"] = () => {
    eventSimulationRef.current?.run();
    // An experiment starts once and runs to its end: resuming playback
    // finds it already going.
    const experiment = stochasticRef.current?.run.experiment;
    if (experiment?.status.get() === "Ready") {
      experiment.start();
    }
  };

  const pause: SimulationContextValue["pause"] = () => {
    eventSimulationRef.current?.pause();
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

    disposeRuns();
    setError(null);
    setErrorItemId(null);

    setStateValues((prev) => ({
      ...prev,
      parameterValues,
      // Keep initialMarking when resetting - it's configuration, not simulation state
    }));
  };

  // Frame access, by index over the run's events: a "frame" is the state an
  // event recorded.
  const readFrame = (index: number): SimulationFrameReader | null =>
    eventSimulationRef.current?.getEventState(index) ?? null;
  const readFrameCount = (): number =>
    eventSimulationRef.current?.trace.get().eventCount ?? 0;

  const getFrame: SimulationContextValue["getFrame"] = (
    frameIndex: number,
  ): Promise<SimulationFrameReader | null> =>
    Promise.resolve(readFrame(frameIndex));

  const getFramesInRange: SimulationContextValue["getFramesInRange"] = (
    startIndex: number,
    endIndex?: number,
  ) => {
    const total = readFrameCount();
    const start = Math.max(0, startIndex);
    const end = endIndex === undefined ? total : Math.min(endIndex, total);
    const slice: SimulationFrameReader[] = [];
    for (let i = start; i < end; i++) {
      const frame = readFrame(i);
      if (frame) {
        slice.push(frame);
      }
    }
    return Promise.resolve(slice);
  };

  const simulationState = mapCoreState(
    eventSimulation || stochastic ? coreStatus : null,
  );
  // The run's own stores, so the source holds still for as long as the run.
  const playbackSource: PlaybackSource | null = eventSimulation
    ? {
        coverage: eventSimulation.trace,
        status: eventSimulation.status,
        demand: eventSimulation.demand,
      }
    : (stochastic?.playbackSource ?? null);
  // The frame count is handed out as a store, so this provider and the
  // consumers of its context are not rendered on every batch the worker posts.
  const totalFramesStore: ReadableStore<number> = eventSimulation
    ? selectStore(eventSimulation.trace, (summary) => summary.eventCount)
    : ZERO_FRAMES_STORE;
  useEffect(() => {
    if (
      shouldNormalizeScenarioSelection({
        effectiveSelectedScenarioId,
        requestedScenarioId,
        requireScenario,
      })
    ) {
      navigation.navigate(
        { scenarioId: effectiveSelectedScenarioId },
        { cause: "normalization", action: "scenario" },
      );
    }
  }, [
    effectiveSelectedScenarioId,
    navigation,
    requestedScenarioId,
    requireScenario,
  ]);
  const effectiveScenarioParameterValues =
    stateValues.selectedScenarioId === undefined ||
    stateValues.selectedScenarioId === effectiveSelectedScenarioId
      ? stateValues.scenarioParameterValues
      : {};

  const selectedScenario = effectiveSelectedScenarioId
    ? petriNetDefinition.scenarios?.find(
        (s) => s.id === effectiveSelectedScenarioId,
      )
    : undefined;

  // No scenario selected: the ad-hoc definition compiles through a scenario
  // generated here and never persisted. The panel's parameter inputs stay
  // the owner of parameter values, so the net parameters are tweaked to the
  // panel's values before expressions read them.
  const adHocNetParameters = extensions.parameters
    ? petriNetDefinition.parameters.map((parameter) => ({
        ...parameter,
        defaultValue:
          stateValues.parameterValues[parameter.variableName] ??
          parameter.defaultValue,
      }))
    : [];
  const adHocSynthesized =
    !selectedScenario && stateValues.adHocScenario
      ? synthesizeAdHocScenario(stateValues.adHocScenario, {
          netParameters: adHocNetParameters,
          places: petriNetDefinition.places,
          types: petriNetDefinition.types,
        })
      : null;

  // Scenario code is lowered to HIR in the language worker (async, keyed on
  // the scenario's code); type checking and interpretation run synchronously
  // during render below. React Compiler will memoize based on inputs.
  const scenarioHirState = useScenarioHir(
    selectedScenario ??
      (adHocSynthesized?.ok ? adHocSynthesized.scenario : undefined),
    {
      requestScenarioHir,
      // A persisted ad-hoc scenario synthesizes in the worker against the
      // net context; the quick-sim definition was synthesized above already.
      adHocContext: {
        netParameters: extensions.parameters
          ? petriNetDefinition.parameters
          : [],
        places: petriNetDefinition.places,
        types: petriNetDefinition.types,
      },
    },
  );

  // Build a scenario with user-tweaked parameter values.
  const tweakedScenario = selectedScenario
    ? {
        ...selectedScenario,
        scenarioParameters: selectedScenario.scenarioParameters.map((sp) => ({
          ...sp,
          default: Number(
            effectiveScenarioParameterValues[sp.identifier] ?? sp.default,
          ),
        })),
      }
    : null;

  let compiledScenarioResult: CompiledScenarioResult | null = null;
  let scenarioCompilationErrors: ScenarioCompilationError[] | null = null;
  if (tweakedScenario) {
    if (scenarioHirState.error !== null) {
      // Keep the errors visible: a failing scenario must not look like an
      // applied one (the marking silently falls back to manual values).
      scenarioCompilationErrors = [
        {
          source: "initialState",
          itemId: "__lowering__",
          message: `Scenario code could not be compiled: ${scenarioHirState.error}`,
        },
      ];
    } else if (scenarioHirState.hir !== null) {
      const outcome = compileScenario(
        tweakedScenario,
        scenarioHirState.hir,
        extensions.parameters ? petriNetDefinition.parameters : [],
        petriNetDefinition.places,
        petriNetDefinition.types,
      );
      if (outcome.ok) {
        compiledScenarioResult = outcome.result;
      } else {
        scenarioCompilationErrors = outcome.errors;
      }
    }
    // While lowering is in flight both stay null: the scenario is neither
    // applied nor failing for this render, matching a just-selected scenario.
  } else if (adHocSynthesized) {
    if (!adHocSynthesized.ok) {
      scenarioCompilationErrors = adHocSynthesized.errors.map(
        (synthesisError) => ({
          source:
            synthesisError.source === "netParameter"
              ? ("parameterOverride" as const)
              : ("initialState" as const),
          itemId: synthesisError.itemId,
          message: synthesisError.message,
        }),
      );
    } else if (scenarioHirState.error !== null) {
      scenarioCompilationErrors = [
        {
          source: "initialState",
          itemId: "__lowering__",
          message: `Scenario code could not be compiled: ${scenarioHirState.error}`,
        },
      ];
    } else if (scenarioHirState.hir !== null) {
      const outcome = compileScenario(
        adHocSynthesized.scenario,
        scenarioHirState.hir,
        adHocNetParameters,
        petriNetDefinition.places,
        petriNetDefinition.types,
      );
      if (outcome.ok) {
        compiledScenarioResult = outcome.result;
      } else {
        scenarioCompilationErrors = outcome.errors;
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

  // Snapshot for `initialize`, which compiles the scenario itself: the
  // saved (tweaked) scenario, or the quick-sim ad-hoc definition already
  // synthesized above — a run must consume the same definition AND the
  // same net parameters the render preview compiled with (the ad-hoc
  // preview overlays the panel's values onto the defaults).
  const scenarioToCompileRef = useLatest(
    tweakedScenario
      ? {
          kind: "scenario" as const,
          scenario: tweakedScenario,
          netParameters: extensions.parameters
            ? petriNetDefinition.parameters
            : [],
        }
      : adHocSynthesized
        ? adHocSynthesized.ok
          ? {
              kind: "scenario" as const,
              scenario: adHocSynthesized.scenario,
              netParameters: adHocNetParameters,
            }
          : // A broken inline definition must refuse to run — falling back
            // to the manual marking would silently ignore what was typed.
            {
              kind: "invalid" as const,
              messages: adHocSynthesized.errors.map(
                (synthesisError) => synthesisError.message,
              ),
            }
        : null,
  );

  const contextValue: SimulationContextValue = {
    state: simulationState,
    error,
    errorItemId,
    parameterValues: effectiveParameterValues,
    initialMarking: effectiveInitialMarking,
    selectedScenarioId: effectiveSelectedScenarioId,
    scenarioParameterValues: effectiveScenarioParameterValues,
    compiledScenarioResult,
    scenarioCompilationErrors,
    adHocScenario: stateValues.adHocScenario,
    adHocNetParameters,
    maxTime: maxTimeIn(mode, stateValues.maxTime),
    totalFramesStore,
    mode,
    simulatorSelection,
    runs: stateValues.runs,
    stochasticRun: stochastic?.run ?? null,
    playbackSource,
    eventSimulation,
    getFrame: useStableCallback(getFrame),
    getFramesInRange: useStableCallback(getFramesInRange),
    setSelectedScenarioId: useStableCallback(setSelectedScenarioId),
    setAdHocScenario: useStableCallback(setAdHocScenario),
    setScenarioParameterValue: useStableCallback(setScenarioParameterValue),
    setInitialMarking: useStableCallback(setInitialMarking),
    setParameterValue: useStableCallback(setParameterValue),
    setMode: useStableCallback(setMode),
    setRuns: useStableCallback(setRuns),
    keepStochasticRun: useStableCallback(keepStochasticRun),
    selectSimulator: useStableCallback(selectSimulator),
    setSimulatorParameter: useStableCallback(setSimulatorParameter),
    setMaxTime: useStableCallback(setMaxTime),
    initialize: useStableCallback(initialize),
    run: useStableCallback(run),
    pause: useStableCallback(pause),
    reset: useStableCallback(reset),
  };

  return (
    <SimulationContext.Provider value={contextValue}>
      {children}
    </SimulationContext.Provider>
  );
};
