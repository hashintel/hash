import { useMemo, useRef, useState, type ReactNode } from "react";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  type MonteCarloUserDefinedMetricDistributionBin,
  type MonteCarloUserDefinedMetricFrame,
} from "@hashintel/petrinaut-core";
import { sirModel } from "@hashintel/petrinaut-core/examples";

import {
  type CreateExperimentInput,
  type ExperimentCell,
  ExperimentsContext,
  type ExperimentRecord,
  type ExperimentsContextValue,
} from "../../../../../../react/experiments/context";
import {
  buildParameterGridCombinations,
  type ExperimentParameterAxis,
} from "../../../../../../react/experiments/parameter-grid";
import {
  EditorContext,
  initialEditorState,
  type EditorContextValue,
  type SimulateViewMode,
} from "../../../../../../react/state/editor-context";

import type { SDCPNContextValue } from "../../../../../../react/state/sdcpn-context";

export const sirSdcpnContextValue: SDCPNContextValue = {
  createNewNet: () => {},
  existingNets: [],
  loadPetriNet: () => {},
  petriNetId: "sir-story-net",
  petriNetDefinition: sirModel.petriNetDefinition,
  readonly: false,
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
  setTitle: () => {},
  title: sirModel.title,
  getItemType: (id) => {
    if (sirModel.petriNetDefinition.places.some((place) => place.id === id)) {
      return "place";
    }
    if (
      sirModel.petriNetDefinition.transitions.some(
        (transition) => transition.id === id,
      )
    ) {
      return "transition";
    }
    if (
      sirModel.petriNetDefinition.parameters.some(
        (parameter) => parameter.id === id,
      )
    ) {
      return "parameter";
    }
    return null;
  },
};

export function makeProgress(
  overrides: Partial<NonNullable<ExperimentRecord["progress"]>> = {},
): NonNullable<ExperimentRecord["progress"]> {
  return {
    activeRuns: 900,
    advancedRuns: 900,
    allFinished: false,
    completedRuns: 100,
    erroredRuns: 0,
    frameNumber: 45,
    runCount: 1_000,
    time: 45,
    ...overrides,
  };
}

export function makeExperiment(
  index: number,
  overrides: Partial<ExperimentRecord> = {},
): ExperimentRecord {
  const status = overrides.status ?? "running";
  const progress =
    status === "initializing"
      ? null
      : makeProgress({
          activeRuns: status === "complete" ? 0 : 900,
          completedRuns: status === "complete" ? 1_000 : 100,
          allFinished: status === "complete",
          time: status === "complete" ? 180 : 45,
          frameNumber: status === "complete" ? 180 : 45,
        });

  return {
    id: `experiment-${index}`,
    name: `SIR Monte Carlo ${index}`,
    createdAt: Date.now() - index * 60_000,
    scenarioId: "scenario__seasonal_flu",
    scenarioName: "Seasonal Flu",
    runCount: 1_000,
    seed: 1_000 + index,
    dt: 1,
    maxTime: 180,
    status,
    error: null,
    metricSpecs: [],
    parameterAxes: [],
    cells: [
      {
        index: 0,
        parameterValues: {},
        status: status === "initializing" ? "pending" : status,
        error: null,
        progress,
        runsCompleted: status === "complete" ? 1_000 : 0,
        metricFrames: overrides.metricFrames ?? [],
        inFlightMetricFrames: [],
      },
    ],
    progress,
    latestMetricFramesById: {},
    metricFrames: [],
    ...overrides,
  };
}

/**
 * Synthetic per-frame token-count histograms for one parameter combination:
 * an epidemic-ish bump whose height scales with `infectionRate` and whose
 * duration stretches with `recoveryDays`, so moving the navigator sliders
 * visibly changes the charts.
 */
function makeSyntheticDistributionFrames(
  combination: Readonly<Record<string, number>>,
  runCount: number,
): MonteCarloUserDefinedMetricFrame[] {
  const infectionRate = combination.infectionRate ?? 0.3;
  const recoveryDays = combination.recoveryDays ?? 10;
  const frames: MonteCarloUserDefinedMetricFrame[] = [];

  for (let frameNumber = 0; frameNumber <= 60; frameNumber++) {
    const time = frameNumber * 3;
    const peakTime = 60 + recoveryDays * 3;
    const width = 25 + recoveryDays * 2;
    const mean =
      400 *
      infectionRate *
      Math.exp(-((time - peakTime) ** 2) / (2 * width ** 2));
    const spread = Math.max(1, Math.round(mean * 0.25));

    const bins: MonteCarloUserDefinedMetricDistributionBin[] = [];
    let remaining = runCount;
    for (let offset = -2; offset <= 2; offset++) {
      const frequency =
        offset === 2
          ? remaining
          : Math.round(runCount * [0.1, 0.2, 0.4, 0.2, 0.1][offset + 2]!);
      remaining -= frequency;
      bins.push([Math.max(0, Math.round(mean + offset * spread)), frequency]);
    }

    frames.push({
      metricId: "infected",
      label: "Infected tokens",
      outputType: "distribution",
      frameNumber,
      time,
      bins: [...new Map(bins).entries()].sort(
        ([left], [right]) => left - right,
      ),
      value: null,
      frameValue: null,
      timeValue: null,
      runSampleCount: runCount,
      timeSampleCount: runCount,
    });
  }

  return frames;
}

/**
 * A completed parameter sweep: 5 × 2 grid over `infectionRate` and
 * `recoveryDays`, with synthetic metric distributions per cell so the
 * parameter navigator has something to show.
 */
export function makeParameterSweepExperiment(): ExperimentRecord {
  const runCount = 200;
  const parameterAxes: ExperimentParameterAxis[] = [
    { identifier: "infectionRate", values: [0.1, 0.2, 0.3, 0.4, 0.5] },
    { identifier: "recoveryDays", values: [7, 14] },
  ];
  const cells: ExperimentCell[] = buildParameterGridCombinations(
    parameterAxes,
  ).map((combination, index) => ({
    index,
    parameterValues: combination,
    status: "complete" as const,
    error: null,
    progress: null,
    runsCompleted: runCount,
    metricFrames: makeSyntheticDistributionFrames(combination, runCount),
    inFlightMetricFrames: [],
  }));

  return {
    ...makeExperiment(9, {
      name: "Infection rate × recovery sweep",
      status: "complete",
      runCount,
    }),
    id: "experiment-sweep",
    parameterAxes,
    cells,
    metricFrames: [],
    progress: makeProgress({
      activeRuns: 0,
      advancedRuns: 0,
      completedRuns: runCount * cells.length,
      allFinished: true,
      frameNumber: 60,
      runCount: runCount * cells.length,
      time: 180,
    }),
  };
}

export const oneExperiment = makeExperiment(1);

export const multipleExperiments: ExperimentRecord[] = [
  makeExperiment(1, {
    name: "Seasonal flu baseline",
    status: "running",
    progress: makeProgress({
      activeRuns: 760,
      completedRuns: 240,
      frameNumber: 72,
      time: 72,
    }),
  }),
  makeExperiment(2, {
    name: "High virulence sensitivity",
    scenarioId: "scenario__high_virulence",
    scenarioName: "High Virulence Outbreak",
    status: "initializing",
    progress: null,
  }),
  makeExperiment(3, {
    name: "Long horizon convergence",
    status: "complete",
    progress: makeProgress({
      activeRuns: 0,
      completedRuns: 1_000,
      allFinished: true,
      frameNumber: 180,
      time: 180,
    }),
  }),
];

const getScenarioName = (scenarioId: string | null): string | null => {
  if (!scenarioId) {
    return null;
  }

  return (
    sirModel.petriNetDefinition.scenarios?.find(
      (scenario) => scenario.id === scenarioId,
    )?.name ?? null
  );
};

const createFakeExperiment = (
  input: CreateExperimentInput,
): ExperimentRecord => ({
  id: `experiment-${Date.now()}`,
  name: input.name,
  createdAt: Date.now(),
  scenarioId: input.scenarioId,
  scenarioName: getScenarioName(input.scenarioId),
  runCount: input.runCount,
  seed: input.seed,
  dt: input.dt,
  maxTime: input.maxTime,
  status: "initializing",
  error: null,
  metricSpecs: input.metricSpecs,
  parameterAxes: [],
  cells: [],
  progress: null,
  latestMetricFramesById: {},
  metricFrames: [],
});

const noopSetExperimentRunFocus = () => {};

export function FakeExperimentsProvider({
  children,
  initialExperiments,
}: {
  children: ReactNode;
  initialExperiments: readonly ExperimentRecord[];
}) {
  const [experiments, setExperiments] = useState<readonly ExperimentRecord[]>(
    () => initialExperiments,
  );
  const [selectedExperimentId, setSelectedExperimentId] = useState<
    string | null
  >(null);
  const selectedExperiment =
    experiments.find((experiment) => experiment.id === selectedExperimentId) ??
    null;

  const value = useMemo<ExperimentsContextValue>(
    () => ({
      experiments,
      selectedExperimentId,
      selectedExperiment,
      setSelectedExperimentId,
      createExperiment: (input) => {
        const experiment = createFakeExperiment(input);
        setExperiments((current) => [experiment, ...current]);
        return Promise.resolve(experiment.id);
      },
      cancelExperiment: (experimentId) => {
        setExperiments((current) =>
          current.map((experiment) =>
            experiment.id === experimentId
              ? { ...experiment, status: "cancelled" }
              : experiment,
          ),
        );
      },
      removeExperiment: (experimentId) => {
        setExperiments((current) =>
          current.filter((experiment) => experiment.id !== experimentId),
        );
      },
      setExperimentRunFocus: noopSetExperimentRunFocus,
    }),
    [experiments, selectedExperiment, selectedExperimentId],
  );

  return <ExperimentsContext value={value}>{children}</ExperimentsContext>;
}

export function FakeEditorProvider({
  children,
  initialSimulateViewMode = "experiments",
}: {
  children: ReactNode;
  initialSimulateViewMode?: SimulateViewMode;
}) {
  const [simulateViewMode, setSimulateViewMode] = useState<SimulateViewMode>(
    initialSimulateViewMode,
  );
  const searchInputRef = useRef<HTMLInputElement>(null);

  const value = useMemo<EditorContextValue>(
    () => ({
      ...initialEditorState,
      globalMode: "simulate",
      simulateViewMode,
      setGlobalMode: () => {},
      setEditionMode: () => {},
      setAddComponentMode: () => {},
      setCursorMode: () => {},
      setLeftSidebarOpen: () => {},
      setLeftSidebarWidth: () => {},
      setPropertiesPanelWidth: () => {},
      setBottomPanelOpen: () => {},
      toggleBottomPanel: () => {},
      setBottomPanelHeight: () => {},
      setActiveBottomPanelTab: () => {},
      isSelected: () => false,
      isSelectedConnection: () => false,
      isNotSelectedConnection: () => false,
      selectedConnections: new Map(),
      setSelection: () => {},
      selectItem: () => {},
      toggleItem: () => {},
      clearSelection: () => {},
      setHoveredItem: () => {},
      clearHoveredItem: () => {},
      isHovered: () => false,
      isHoveredConnection: () => false,
      isNotHoveredConnection: () => false,
      setDraggingStateByNodeId: () => {},
      updateDraggingStateByNodeId: () => {},
      setSimulateDrawer: () => {},
      setAiAssistantOpen: () => {},
      toggleAiAssistant: () => {},
      resetDraggingState: () => {},
      collapseAllPanels: () => {},
      setTimelineChartType: () => {},
      setTimelineView: () => {},
      setHiddenTimelineSeriesIds: () => {},
      setSimulateViewMode,
      setSearchOpen: () => {},
      triggerPanelAnimation: () => {},
      __reinitialize: () => {},
      searchInputRef,
    }),
    [simulateViewMode],
  );

  return <EditorContext value={value}>{children}</EditorContext>;
}
