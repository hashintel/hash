import { use, useEffect, useRef, useState, type ReactNode } from "react";

import {
  type CreateExperimentInput,
  ExperimentsActionsContext,
  type ExperimentsActionsValue,
  ExperimentsContext,
  type ExperimentRecord,
  type ExperimentsContextValue,
} from "../../../../../../react/experiments/context";
import { computeBackendOf } from "../../../../../../react/experiments/provider/create-experiment";
import { sweepSelectionKey } from "../../../../../../react/experiments/sweep-session/selection-draws";
import { useLatest } from "../../../../../../react/hooks/use-latest";
import {
  usePetrinautNavigate,
  simulateDrawerToNavigationResource,
  simulateDrawerToNavigationOverlay,
} from "../../../../../../react/navigation/navigation";
import {
  EditorContext,
  type EditorContextValue,
  type SimulateDrawerState,
  type SimulateViewMode,
} from "../../../../../../react/state/editor-context";
import {
  sirInfectedFrame,
  sirSdcpnContextValue,
  syntheticVisitedCell,
} from "./experiments-story-fixtures";

import type { Scenario } from "@hashintel/petrinaut-core";

const getScenario = (scenarioId: string | null): Scenario | null =>
  scenarioId
    ? (sirSdcpnContextValue.petriNetDefinition.scenarios?.find(
        (scenario) => scenario.id === scenarioId,
      ) ?? null)
    : null;

const createFakeExperiment = (
  input: CreateExperimentInput,
): ExperimentRecord => ({
  id: `experiment-${Date.now()}`,
  computeBackend: input.simulator
    ? computeBackendOf(input.simulator.simulatorId)
    : (input.computeBackend ?? "cpu"),
  computeBackendFallbackReason: null,
  simulatorLabel: null,
  name: input.name,
  createdAt: Date.now(),
  scenarioId: input.scenarioId,
  scenarioName: getScenario(input.scenarioId)?.name ?? null,
  runCount: input.runCount,
  seed: input.seed,
  clock: "time",
  dt: input.dt,
  maxTime: input.maxTime,
  status: "initializing",
  error: null,
  metricSpecs: input.metricSpecs,
  startedAt: null,
  finishedAt: null,
  progress: null,
  latestMetricFramesById: {},
  metricFrames: [],
  sweepBatches: [],
  parameterAxes: [],
  sweep: null,
  scenarioParameterValues: {},
  constraints: input.constraints ?? [],
  constraintPolicy: input.constraintPolicy ?? null,
  scenario: getScenario(input.scenarioId),
});

export function FakeExperimentsProvider({
  children,
  initialExperiments,
  restreamOnSelectionChange = false,
}: {
  children: ReactNode;
  initialExperiments: readonly ExperimentRecord[];
  /**
   * Simulates what the real sweep session does on a selection change:
   * frames clear immediately, then the new selection's distribution streams
   * back in after a compute gap.
   */
  restreamOnSelectionChange?: boolean;
}) {
  const navigateRef = useLatest(usePetrinautNavigate());
  const [experiments, setExperiments] = useState<readonly ExperimentRecord[]>(
    () => initialExperiments,
  );
  const [selectedExperimentId, setSelectedExperimentId] = useState<
    string | null
  >(null);
  const selectedExperiment =
    experiments.find((experiment) => experiment.id === selectedExperimentId) ??
    null;

  /** Cancels the previous fake restream when the selection moves again. */
  const restreamRef = useRef<{
    generation: number;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ generation: 0, timer: null });
  useEffect(
    () => () => {
      if (restreamRef.current.timer !== null) {
        clearTimeout(restreamRef.current.timer);
      }
    },
    [],
  );

  const isPointSelectionOf = (
    selection: Readonly<Record<string, { from: number; to: number }>>,
  ): boolean =>
    Object.values(selection).every((range) => range.from === range.to);
  const pointOf = (
    selection: Readonly<Record<string, { from: number; to: number }>>,
  ): Readonly<Record<string, number>> =>
    Object.fromEntries(
      Object.entries(selection).map(([axisId, range]) => [axisId, range.from]),
    );

  const restream = (
    experimentId: string,
    selection: Readonly<Record<string, { from: number; to: number }>>,
  ) => {
    const generation = ++restreamRef.current.generation;
    if (restreamRef.current.timer !== null) {
      clearTimeout(restreamRef.current.timer);
    }
    // Selection midpoints in value space, against the sweep fixture's axes.
    const midpoint = (axis: {
      identifier: string;
      min: number;
      max: number;
      stepCount: number;
    }) => {
      const range = selection[axis.identifier] ?? {
        from: 0,
        to: axis.stepCount,
      };
      const position = (range.from + range.to) / 2;
      return axis.min + (position / axis.stepCount) * (axis.max - axis.min);
    };

    let upTo = 0;
    const step = () => {
      if (generation !== restreamRef.current.generation) {
        return;
      }
      upTo = Math.min(46, upTo + 4);
      setExperiments((current) =>
        current.map((experiment) => {
          if (experiment.id !== experimentId || !experiment.sweep) {
            return experiment;
          }
          const transmissionRate = midpoint(
            experiment.parameterAxes.find(
              (axis) => axis.identifier === "transmission_rate",
            ) ?? { identifier: "", min: 0.3, max: 0.3, stepCount: 1 },
          );
          const recoveryDays = midpoint(
            experiment.parameterAxes.find(
              (axis) => axis.identifier === "recovery_days",
            ) ?? { identifier: "", min: 8, max: 8, stepCount: 1 },
          );
          const runs = upTo < 46 ? 25 : 100;
          const frames = Array.from({ length: upTo }, (_, frameNumber) =>
            sirInfectedFrame({
              frameNumber,
              transmissionRate,
              recoveryDays,
              spread: 9,
              runs,
            }),
          );
          return {
            ...experiment,
            metricFrames: frames,
            latestMetricFramesById:
              frames.length > 0 ? { infected: frames.at(-1)! } : {},
            sweep: {
              ...experiment.sweep,
              runsCompleted: runs,
              runsSampled: runs,
              runTarget: upTo < 46 ? 100 : null,
              computing: upTo < 46,
              visited:
                upTo < 46 || !isPointSelectionOf(selection)
                  ? experiment.sweep.visited
                  : [
                      ...experiment.sweep.visited.filter(
                        (entry) =>
                          JSON.stringify(entry.position) !==
                          JSON.stringify(pointOf(selection)),
                      ),
                      syntheticVisitedCell(pointOf(selection), runs),
                    ],
            },
          };
        }),
      );
      if (upTo < 46) {
        restreamRef.current.timer = setTimeout(step, 160);
      }
    };
    // The compute gap the charts bridge with the previous picture.
    restreamRef.current.timer = setTimeout(step, 900);
  };

  /** What the real session does on a selection change, as the fake records it. */
  const applySweepSelection = (
    experimentId: string,
    selection: Readonly<Record<string, { from: number; to: number }>>,
  ) => {
    setExperiments((current) =>
      current.map((experiment) =>
        experiment.id === experimentId && experiment.sweep
          ? restreamOnSelectionChange
            ? {
                ...experiment,
                metricFrames: [],
                latestMetricFramesById: {},
                sweep: {
                  ...experiment.sweep,
                  selection,
                  selectionKey: sweepSelectionKey(
                    experiment.parameterAxes,
                    selection,
                  ),
                  runsCompleted: 0,
                  runsSampled: 0,
                  runTarget: 8,
                  computing: true,
                },
              }
            : {
                ...experiment,
                sweep: {
                  ...experiment.sweep,
                  selection,
                  selectionKey: sweepSelectionKey(
                    experiment.parameterAxes,
                    selection,
                  ),
                },
              }
          : experiment,
      ),
    );
    if (restreamOnSelectionChange) {
      restream(experimentId, selection);
    }
  };

  // Built once: every callback closes over stable setters and refs, so the
  // actions context holds still across publishes the way the real one does.
  const [actions] = useState<ExperimentsActionsValue>(() => ({
    setSelectedExperimentId: (id) => {
      setSelectedExperimentId(id);
      navigateRef.current(
        {
          simulateResource: id === null ? null : { type: "experiment", id },
          overlay: null,
        },
        { cause: "user", action: "simulation-resource" },
      );
    },
    createExperiment: (input) => {
      const experiment = createFakeExperiment(input);
      setExperiments((current) => [experiment, ...current]);
      return Promise.resolve(experiment);
    },
    adoptExperiment: () => {
      throw new Error("Nothing adopts an experiment here");
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
    setSweepSelection: applySweepSelection,
    navigateSweep: (experimentId, selection, options) =>
      new Promise((resolve) => {
        applySweepSelection(experimentId, selection);
        const position = Object.fromEntries(
          Object.entries(selection).map(([axisId, range]) => [
            axisId,
            Math.round((range.from + range.to) / 2),
          ]),
        );
        const cell = syntheticVisitedCell(position, options?.runCap ?? 100);
        setTimeout(() => {
          setExperiments((current) =>
            current.map((experiment) =>
              experiment.id === experimentId && experiment.sweep
                ? {
                    ...experiment,
                    sweep: {
                      ...experiment.sweep,
                      runsCompleted: cell.runsCompleted,
                      runsSampled: cell.runsCompleted,
                      runTarget: null,
                      computing: false,
                      visited: [
                        ...experiment.sweep.visited.filter(
                          (entry) =>
                            JSON.stringify(entry.position) !==
                            JSON.stringify(cell.position),
                        ),
                        cell,
                      ],
                    },
                  }
                : experiment,
            ),
          );
          resolve(cell);
        }, 700);
      }),
  }));

  const value: ExperimentsContextValue = {
    experiments,
    selectedExperimentId,
    selectedExperiment,
    ...actions,
  };

  return (
    <ExperimentsContext value={value}>
      <ExperimentsActionsContext value={actions}>
        {children}
      </ExperimentsActionsContext>
    </ExperimentsContext>
  );
}

export function FakeEditorProvider({
  children,
  initialSimulateViewMode = "experiments",
}: {
  children: ReactNode;
  initialSimulateViewMode?: SimulateViewMode;
}) {
  // No editor is above a fake one, so this is the context's default: the
  // editor's first state, and every action doing nothing.
  const defaults = use(EditorContext);
  const navigate = usePetrinautNavigate();
  const [simulateViewMode, setSimulateViewMode] = useState<SimulateViewMode>(
    initialSimulateViewMode,
  );
  // Stateful so stories that mount SimulationCreationDrawer can open it.
  const [simulateDrawer, setSimulateDrawer] = useState<SimulateDrawerState>({
    type: "closed",
  });
  const searchInputRef = useRef<HTMLInputElement>(null);

  const value: EditorContextValue = {
    ...defaults,
    globalMode: "simulate",
    simulateViewMode,
    setSimulateViewMode,
    simulateDrawer,
    setSimulateDrawer: (drawer) => {
      setSimulateDrawer(drawer);
      navigate(
        (current) => ({
          ...current,
          simulateResource: simulateDrawerToNavigationResource(drawer, current),
          overlay: simulateDrawerToNavigationOverlay(drawer, current.overlay),
        }),
        { cause: "user", action: "overlay" },
      );
    },
    searchInputRef,
  };

  return <EditorContext value={value}>{children}</EditorContext>;
}
