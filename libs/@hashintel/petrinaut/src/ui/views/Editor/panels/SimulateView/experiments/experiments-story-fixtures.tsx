import { useMemo, useRef, useState, type ReactNode } from "react";

import { sirModel } from "@hashintel/petrinaut-core/examples";

import {
  type CreateExperimentInput,
  ExperimentsContext,
  type ExperimentRecord,
  type ExperimentsContextValue,
} from "../../../../../../react/experiments/context";
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
    progress:
      status === "initializing"
        ? null
        : makeProgress({
            activeRuns: status === "complete" ? 0 : 900,
            completedRuns: status === "complete" ? 1_000 : 100,
            allFinished: status === "complete",
            time: status === "complete" ? 180 : 45,
            frameNumber: status === "complete" ? 180 : 45,
          }),
    distributionFrames: [],
    latestMetricFramesById: {},
    metricFrames: [],
    ...overrides,
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
  progress: null,
  distributionFrames: [],
  latestMetricFramesById: {},
  metricFrames: [],
});

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
