/**
 * @layerRoot react.simulation
 * @role Owns the run configuration, starts runs and experiments on the selected simulator, and mirrors their handles into React
 */

import { use, useEffect, useRef, useState } from "react";

import {
  createExperimentReader,
  DEFAULT_EXPERIMENT_SAMPLE_PERIOD,
  placeCountMetricSpecs,
  runClockOf,
  runContinuityOf,
  experimentSamplePeriod,
  compileScenario,
  type AdHocScenarioState,
  type EventSimulation,
  type ReadableStore,
  type SimulationRequestBase,
  type SimulationState as CoreSimulationState,
  type CompiledScenarioResult,
} from "@hashintel/petrinaut-core";

import { deriveDefaultParameterValues } from "../hooks/use-default-parameter-values";
import { useLatest } from "../hooks/use-latest";
import { useStableCallback } from "../hooks/use-stable-callback";
import {
  LanguageClientContext,
  type LanguageClientContextValue,
} from "../lsp/context";
import { usePetrinautNavigation } from "../navigation/navigation";
import { NotificationsContext } from "../notifications/context";
import { usePublished } from "../select-from-context";
import {
  findSimulator,
  SimulatorsContext,
  type SimulationMode,
} from "../simulators/context";
import { SDCPNContext } from "../state/sdcpn-context";
import { useExecutableDefinition } from "../state/use-executable-definition";
import { constantStore, selectStore, useStore } from "../use-store";
import {
  type InitialMarking,
  type PlaybackSource,
  type StochasticRun,
  SimulationContext,
  type SimulationContextValue,
  type SimulationFrameReader,
  SimulationPublishedContext,
  type SimulationState,
} from "./context";
import {
  migrateInitialMarkingForTypeChanges,
  snapshotTypeElements,
  type TypeElementsSnapshot,
} from "./provider/migrate-initial-marking";
import {
  getEffectiveSelectedScenarioId,
  getScenarioParameterDefaults,
  shouldNormalizeScenarioSelection,
} from "./provider/scenario-selection";
import {
  simulatorParametersKey,
  simulatorSelectionIn,
  type SimulatorChoices,
} from "./provider/simulator-selection";
import {
  releasingOnDispose,
  startSimulatorExperiment,
  startSimulatorRun,
} from "./provider/start-on-simulator";
import { createStochasticPlaybackSource } from "./provider/stochastic-playback-source";
import { useRunScenario } from "./provider/use-run-scenario";
import { runEndOf } from "./run-end";

import type { ScenarioHirRequest } from "./use-scenario-hir";

/** Configuration values that aren't managed by the worker. */
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
 * The editor's lifecycle state for a run in a core state: "NotRun" while it
 * initializes, "Paused" once it is ready.
 */
const simulationStateOf: Record<CoreSimulationState, SimulationState> = {
  Initializing: "NotRun",
  Ready: "Paused",
  Running: "Running",
  Paused: "Paused",
  Complete: "Complete",
  Error: "Error",
};

/** Compilation surface consumed by simulation without coupling it to an LSP. */
export type SimulationCompiler = {
  requestHirArtifacts: LanguageClientContextValue["requestHirArtifacts"];
  requestScenarioHir: ScenarioHirRequest;
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
 * React Compiler does not lower.
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
  const { extensions } = sdcpnContext;
  // A run takes one net: the document with the components of its imports
  // inlined. Its root places, parameters and scenarios are the document's.
  const petriNetDefinition = useExecutableDefinition();
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

  const effectiveScenarioParameterValues =
    stateValues.selectedScenarioId === undefined ||
    stateValues.selectedScenarioId === effectiveSelectedScenarioId
      ? stateValues.scenarioParameterValues
      : {};
  const selectedScenario = effectiveSelectedScenarioId
    ? petriNetDefinition.scenarios?.find(
        (scenario) => scenario.id === effectiveSelectedScenarioId,
      )
    : undefined;
  const {
    target: scenarioToCompile,
    compiled: compiledScenarioResult,
    errors: scenarioCompilationErrors,
    adHocNetParameters,
  } = useRunScenario({
    definition: petriNetDefinition,
    parametersEnabled: extensions.parameters,
    selectedScenario,
    parameterValues: stateValues.parameterValues,
    scenarioParameterValues: effectiveScenarioParameterValues,
    adHocScenario: stateValues.adHocScenario,
    requestScenarioHir,
  });
  // `initialize` compiles the target itself, not the preview of it: the
  // preview lowers asynchronously, and a run started while that request is in
  // flight must not fall back to manual values.
  const scenarioToCompileRef = useLatest(scenarioToCompile);

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
  const [failure, setFailure] = useState<{
    message: string;
    itemId: string | null;
  } | null>(null);

  // Subscribe to the active simulation's stores. EMPTY_*_STORE provides a
  // stable fallback so hook order doesn't change when no sim is active.
  const coreStatus = useStore(
    eventSimulation?.status ??
      stochastic?.playbackSource.status ??
      EMPTY_STATUS_STORE,
  );

  useEffect(() => {
    if (!eventSimulation) {
      return;
    }
    const off = eventSimulation.events.subscribe((event) => {
      if (event.type === "error") {
        setFailure({ message: event.message, itemId: event.itemId });
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
        setFailure({ message: event.message, itemId: event.itemId });
      } else if (event.type === "complete" && !stochastic.run.kept) {
        // A kept experiment's completion is reported by its new owner.
        addNotification({ message: "Simulation complete", tone: "success" });
      }
    });
  }, [addNotification, stochastic]);

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

  /**
   * Tears down whichever run is live and clears its handle in the ref and in
   * React state, so a same-tick caller sees it gone.
   */
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
    setFailure(null);
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
    setEventSimulation(null);
    setStochastic(null);
    setFailure(null);
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

  /**
   * Changes the configuration. A change the live run does not reflect
   * discards it; each setter says whether its change is one.
   */
  const configure = (
    discardsRun: boolean,
    patch: (previous: SimulationStateValues) => Partial<SimulationStateValues>,
  ): void => {
    if (discardsRun) {
      invalidateSimulationForConfigurationChange();
    }
    setStateValues((previous) => ({ ...previous, ...patch(previous) }));
  };

  const setAdHocScenario: SimulationContextValue["setAdHocScenario"] = (
    adHocScenario,
  ) =>
    configure(stateValuesRef.current.adHocScenario !== adHocScenario, () => ({
      adHocScenario,
    }));

  const setScenarioParameterValue: SimulationContextValue["setScenarioParameterValue"] =
    (identifier, value) => {
      configure(
        stateValuesRef.current.scenarioParameterValues[identifier] !== value,
        (previous) => ({
          selectedScenarioId:
            requestedScenarioId === undefined
              ? effectiveSelectedScenarioId
              : requestedScenarioId,
          scenarioParameterValues: {
            ...previous.scenarioParameterValues,
            [identifier]: value,
          },
        }),
      );

      if (
        requestedScenarioId === undefined &&
        effectiveSelectedScenarioId !== null
      ) {
        navigation.navigate(
          { scenarioId: effectiveSelectedScenarioId },
          { cause: "normalization", action: "scenario" },
        );
      }
    };

  const setInitialMarking: SimulationContextValue["setInitialMarking"] = (
    placeId,
    marking,
  ) =>
    configure(true, (previous) => ({
      initialMarking: { ...previous.initialMarking, [placeId]: marking },
    }));

  const setParameterValue: SimulationContextValue["setParameterValue"] = (
    parameterId,
    value,
  ) =>
    configure(
      stateValuesRef.current.parameterValues[parameterId] !== value,
      (previous) => ({
        parameterValues: { ...previous.parameterValues, [parameterId]: value },
      }),
    );

  const setMaxTime: SimulationContextValue["setMaxTime"] = (maxTime) =>
    configure(stateValuesRef.current.maxTime !== maxTime, () => ({ maxTime }));

  const selectSimulator: SimulationContextValue["selectSimulator"] = (
    simulatorId,
  ) =>
    configure(
      simulatorSelectionRef.current.simulatorId !== simulatorId,
      (previous) => ({
        simulatorIds: {
          ...previous.simulatorIds,
          [previous.mode]: simulatorId,
        },
      }),
    );

  const setMode: SimulationContextValue["setMode"] = (nextMode) =>
    configure(stateValuesRef.current.mode !== nextMode, () => ({
      mode: nextMode,
    }));

  const setRuns: SimulationContextValue["setRuns"] = (runs) => {
    if (Number.isInteger(runs) && runs >= 1) {
      configure(stateValuesRef.current.runs !== runs, () => ({ runs }));
    }
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
      configure(parameters[key] !== value, (previous) => {
        const parametersKey = simulatorParametersKey(
          previous.mode,
          simulatorId,
        );
        return {
          simulatorParameters: {
            ...previous.simulatorParameters,
            [parametersKey]: {
              ...previous.simulatorParameters[parametersKey],
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
    // artifacts and execution always use the same model configuration.
    const manualInitialMarking = currentState.initialMarking;
    const manualParameterValues = simulationExtensions.parameters
      ? currentState.parameterValues
      : {};
    const target = scenarioToCompileRef.current;

    // Refused before anything is torn down: a definition that does not
    // compile leaves the run that is already going, and only reports.
    if (target?.kind === "invalid") {
      const refusal = new Error(
        `The inline initial state does not compile:\n${target.errors.map((invalid) => invalid.message).join("\n")}`,
      );
      setFailure({ message: refusal.message, itemId: null });
      throw refusal;
    }

    disposeRuns();
    setFailure(null);

    let eventSim: EventSimulation | null = null;
    let stochasticRun: StochasticRun | null = null;
    try {
      let initialMarking = manualInitialMarking;
      let parameterValues: Record<string, string> = manualParameterValues;
      if (target) {
        const scenarioHir = await requestScenarioHir(
          {
            parameterOverrides: target.scenario.parameterOverrides,
            initialState: target.scenario.initialState,
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
          target.scenario.id,
        );
        if (initializationGenerationRef.current !== generation) {
          return false;
        }
        const compiled = compileScenarioForRun(
          target.scenario,
          scenarioHir,
          target.netParameters,
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
        const experimentClock = runClockOf(
          simulationSdcpn,
          simulationExtensions,
        );
        // Named to the simulator rather than left to it, so the samples are
        // spaced as playback and a kept experiment say they are.
        const samplePeriod =
          (registration
            ? experimentSamplePeriod(
                experimentClock,
                registration,
                selection.parameters,
              )
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
          clock: experimentClock,
          // An experiment without an end is refused before it starts.
          maxTime: runEndOf(experimentClock, maxTime ?? 0),
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
      setFailure({ message: message, itemId: null });
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
    const sdcpn = petriNetDefinitionRef.current;
    const parameters = extensionsRef.current.parameters ? sdcpn.parameters : [];
    const defaultValues = deriveDefaultParameterValues(parameters);

    const parameterValues: Record<string, string> = {};
    for (const [key, value] of Object.entries(defaultValues)) {
      parameterValues[key] = String(value);
    }

    configure(true, () => ({ parameterValues }));
  };

  const getFramesInRange: SimulationContextValue["getFramesInRange"] = (
    startIndex: number,
    endIndex?: number,
  ) => {
    const simulation = eventSimulationRef.current;
    const total = simulation?.trace.get().eventCount ?? 0;
    const start = Math.max(0, startIndex);
    const end = endIndex === undefined ? total : Math.min(endIndex, total);
    const slice: SimulationFrameReader[] = [];
    for (let i = start; i < end; i++) {
      const frame = simulation?.getEventState(i);
      if (frame) {
        slice.push(frame);
      }
    }
    return Promise.resolve(slice);
  };

  const simulationState =
    eventSimulation || stochastic ? simulationStateOf[coreStatus] : "NotRun";
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

  let effectiveParameterValues = extensions.parameters
    ? stateValues.parameterValues
    : {};
  let effectiveInitialMarking = stateValues.initialMarking;

  if (compiledScenarioResult) {
    effectiveParameterValues = compiledScenarioResult.parameterValues;
    effectiveInitialMarking = {
      ...stateValues.initialMarking,
      ...compiledScenarioResult.initialState,
    };
  }

  // The run or the experiment says what its positions count. Before one
  // exists the net does: an untimed net is simulated in steps in either mode.
  const clock =
    eventSimulation?.clock ??
    stochastic?.run.clock ??
    runClockOf(petriNetDefinition, extensions);
  const continuity =
    eventSimulation?.continuity ??
    runContinuityOf(petriNetDefinition, extensions);

  const contextValue: SimulationContextValue = {
    state: simulationState,
    error: failure?.message ?? null,
    errorItemId: failure?.itemId ?? null,
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
    clock,
    continuity,
    simulatorSelection,
    runs: stateValues.runs,
    stochasticRun: stochastic?.run ?? null,
    playbackSource,
    eventSimulation,
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
  const published = usePublished(contextValue);

  return (
    <SimulationPublishedContext value={published}>
      <SimulationContext value={contextValue}>{children}</SimulationContext>
    </SimulationPublishedContext>
  );
};
