import { useEffect, useRef, useState, type ReactNode } from "react";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "@hashintel/petrinaut-core";
import { sirModel } from "@hashintel/petrinaut-core/examples";

import {
  type CreateExperimentInput,
  ExperimentsActionsContext,
  type ExperimentsActionsValue,
  ExperimentsContext,
  type ExperimentRecord,
  type ExperimentsContextValue,
  isTerminalExperimentStatus,
  type SweepVisitedCell,
} from "../../../../../../react/experiments/context";
import { sweepSelectionKey } from "../../../../../../react/experiments/sweep-session";
import {
  EditorContext,
  initialEditorState,
  type EditorContextValue,
  type PetrinautSimulatePresentation,
  type SimulateDrawerState,
  type SimulateViewMode,
} from "../../../../../../react/state/editor-context";

import type { SDCPNContextValue } from "../../../../../../react/state/sdcpn-context";
import type { Constraint } from "@hashintel/petrinaut-core";

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
  const createdAt = Date.now() - index * 60_000;
  // Stepping begins shortly after creation, once user code has compiled. An
  // initializing experiment has not reached that point.
  const startedAt = status === "initializing" ? null : createdAt + 800;

  return {
    id: `experiment-${index}`,
    computeBackend: "cpu",
    computeBackendFallbackReason: null,
    name: `SIR Monte Carlo ${index}`,
    createdAt,
    startedAt,
    // A running experiment's elapsed time is measured against the live clock, so
    // it advances while the story is open — as it does in the app.
    finishedAt:
      startedAt !== null && isTerminalExperimentStatus(status)
        ? startedAt + 47_300
        : null,
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
    latestMetricFramesById: {},
    sweepBatches: [],
    parameterAxes: [],
    sweep: null,
    metricFrames: [],
    scenarioParameterValues: {},
    constraints: [],
    constraintPolicy: null,
    ...overrides,
  };
}

/**
 * The synthetic objective every fake visit measures: a smooth bump over the
 * sweep fixture's parameter values, so a story's contour fills in the way a
 * real sweep's would. `transmissionRate` and `recoveryDays` are values, not
 * positions.
 */
export function syntheticSweepObjective(
  transmissionRate: number,
  recoveryDays: number,
): number {
  return (
    100 *
      Math.exp(
        -((transmissionRate - 0.35) ** 2) * 20 -
          ((recoveryDays - 10) / 14) ** 2,
      ) +
    6 * Math.sin(transmissionRate * 9) +
    recoveryDays / 4
  );
}

/** The sweep fixture's axes, for turning a position into a value. */
const SWEEP_FIXTURE_AXES = {
  transmission_rate: { min: 0.1, max: 0.5, stepCount: 50 },
  recovery_days: { min: 2, max: 20, stepCount: 18 },
} as const;

/** The points the sweep fixture has visited: a walk the navigator took. */
export const SWEEP_FIXTURE_VISITS: readonly Readonly<Record<string, number>>[] =
  [
    { transmission_rate: 10, recovery_days: 3 },
    { transmission_rate: 40, recovery_days: 15 },
    { transmission_rate: 32, recovery_days: 8 },
    { transmission_rate: 18, recovery_days: 12 },
    { transmission_rate: 25, recovery_days: 6 },
  ];

/**
 * A visited cell of the sweep fixture: the synthetic objective under the
 * "infected" metric at a quantized position on the fixture's axes.
 */
export function syntheticVisitedCell(
  position: Readonly<Record<string, number>>,
  runsCompleted: number,
): SweepVisitedCell {
  const value = (
    axis: keyof typeof SWEEP_FIXTURE_AXES,
    fallback: number,
  ): number => {
    const { min, max, stepCount } = SWEEP_FIXTURE_AXES[axis];
    const at = position[axis];
    return at === undefined ? fallback : min + ((max - min) * at) / stepCount;
  };
  return {
    position,
    runsCompleted,
    means: {
      infected: Math.round(
        syntheticSweepObjective(
          value("transmission_rate", 0.3),
          value("recovery_days", 8),
        ),
      ),
    },
  };
}

/**
 * A sweep over two SIR scenario parameters, mid-refinement on its selected
 * combination. The frames are a small synthetic infected-count distribution so
 * the navigator has a chart to sit above.
 */
export function makeParameterSweepExperiment(): ExperimentRecord {
  const frames = Array.from({ length: 46 }, (_, frameNumber) => {
    const peak = 60 + 30 * Math.sin(frameNumber / 7);
    return {
      metricId: "infected",
      label: "Infected",
      outputType: "distribution" as const,
      frameNumber,
      time: frameNumber,
      bins: [
        [Math.round(peak - 8), 5],
        [Math.round(peak), 14],
        [Math.round(peak + 9), 6],
      ] as (readonly [number, number])[],
      value: null,
      frameValue: null,
      timeValue: null,
      runSampleCount: 25,
      timeSampleCount: 25,
    };
  });

  return makeExperiment(4, {
    name: "SIR transmission sweep",
    status: "running",
    runCount: 100,
    metricSpecs: [
      {
        kind: "placeTokenCountMean",
        id: "infected",
        label: "Infected",
        placeId: "place__infected",
        runOutput: { type: "distribution", binning: "exact" },
      },
    ],
    sweepBatches: [],
    parameterAxes: [
      {
        identifier: "transmission_rate",
        min: 0.1,
        max: 0.5,
        stepCount: 50,
        integer: false,
      },
      {
        identifier: "recovery_days",
        min: 2,
        max: 20,
        stepCount: 18,
        integer: true,
      },
    ],
    sweep: {
      selection: {
        transmission_rate: { from: 25, to: 25 },
        recovery_days: { from: 6, to: 6 },
      },
      selectionKey: "transmission_rate=25|recovery_days=6",
      runsCompleted: 25,
      runsSampled: 61,
      runTarget: 100,
      computing: true,
      visited: SWEEP_FIXTURE_VISITS.map((position) =>
        syntheticVisitedCell(
          position,
          position.transmission_rate === 25 ? 25 : 8,
        ),
      ),
    },
    metricFrames: frames,
    latestMetricFramesById: { infected: frames.at(-1)! },
  });
}

const constraintHirSpan = { start: 0, length: 0 };

/**
 * The sweep with one constraint of each kind, lowered as the language worker
 * would lower them: the transmission rate capped below its interval's top,
 * and the infected count held under 900 on every frame.
 */
export const sweepFixtureConstraints: Constraint[] = [
  {
    space: "parameters",
    id: "transmission-cap",
    name: "Parameter constraint 1",
    code: "scenario.transmission_rate < 0.45",
    hir: {
      hirVersion: 1,
      surface: "scenario-expression",
      params: [],
      span: constraintHirSpan,
      body: {
        kind: "binary",
        id: 0,
        span: constraintHirSpan,
        op: "<",
        left: {
          kind: "scenarioRef",
          id: 1,
          span: constraintHirSpan,
          name: "transmission_rate",
        },
        right: {
          kind: "numberLit",
          id: 2,
          span: constraintHirSpan,
          value: 0.45,
          raw: "0.45",
        },
      },
    },
  },
  {
    space: "state",
    id: "infected-cap",
    name: "State constraint 1",
    code: "return state.places.Infected.count <= 900;",
    hir: {
      hirVersion: 1,
      surface: "metric",
      params: [{ name: "state", span: constraintHirSpan }],
      span: constraintHirSpan,
      body: {
        kind: "binary",
        id: 0,
        span: constraintHirSpan,
        op: "<=",
        left: {
          kind: "fieldAccess",
          id: 1,
          span: constraintHirSpan,
          field: "count",
          fieldSpan: constraintHirSpan,
          target: {
            kind: "fieldAccess",
            id: 2,
            span: constraintHirSpan,
            field: "Infected",
            fieldSpan: constraintHirSpan,
            target: {
              kind: "fieldAccess",
              id: 3,
              span: constraintHirSpan,
              field: "places",
              fieldSpan: constraintHirSpan,
              target: {
                kind: "localRef",
                id: 4,
                span: constraintHirSpan,
                name: "state",
              },
            },
          },
        },
        right: {
          kind: "numberLit",
          id: 5,
          span: constraintHirSpan,
          value: 900,
          raw: "900",
        },
      },
    },
  },
];

/** The two-axis sweep carrying both fixture constraints at a 90% pass threshold. */
export function makeConstrainedSweepExperiment(): ExperimentRecord {
  return {
    ...makeParameterSweepExperiment(),
    scenarioParameterValues: { transmission_rate: 0.3, recovery_days: 7 },
    constraints: sweepFixtureConstraints,
    constraintPolicy: { alpha: 0.1 },
  };
}

type StoryMetricFrame = ExperimentRecord["metricFrames"][number];

/**
 * A deterministic SIR-ish infected count at `time` for the given parameter
 * values: one epidemic wave whose height grows with the transmission rate
 * and whose timing and length grow with the recovery time. Subcritical
 * parameters (transmission_rate × recovery_days ≤ 1) stay nearly flat, so
 * moving the navigator visibly reshapes the curve.
 */
export function sirInfectedMean(
  time: number,
  transmissionRate: number,
  recoveryDays: number,
): number {
  const r0 = transmissionRate * recoveryDays;
  const attack = Math.max(0, 1 - 1 / Math.max(r0, 1.01));
  const peak = 350 * attack;
  const peakTime = 8 + recoveryDays * (1.4 - transmissionRate);
  const width = 4 + recoveryDays * 0.9;
  const pulse = Math.exp(-(((time - peakTime) / width) ** 2));
  return peak * pulse + 10 * attack;
}

/** A deterministic pseudo-random fraction in [0, 1) that varies by inputs. */
function storyNoise(a: number, b: number): number {
  const raw = Math.sin((a + 1) * 374.761 + (b + 1) * 668.265) * 43_758.545;
  return raw - Math.floor(raw);
}

/**
 * One synthetic distribution frame of the "Infected" metric: integer bins
 * spread around `sirInfectedMean`. More `runs` fill more bins with smoother
 * frequencies (sampling jitter shrinks as 1/√runs), so a story replaying the
 * refinement ladder shows distributions sharpening the way a real batch
 * merge does; a wider `spread` widens the histogram, the way a range
 * selection's per-run parameter draws do.
 */
export function sirInfectedFrame(options: {
  frameNumber: number;
  transmissionRate: number;
  recoveryDays: number;
  /** Half-width of the run distribution around the mean, in tokens. */
  spread: number;
  /** Runs contributing to the frame. */
  runs: number;
}): StoryMetricFrame {
  const { frameNumber, transmissionRate, recoveryDays, spread, runs } = options;
  const mean = sirInfectedMean(frameNumber, transmissionRate, recoveryDays);
  const center = Math.round(mean);
  const sigma = Math.max(1, spread);
  // Few runs resolve only a few coarse bins; more runs fill the whole ±2σ.
  const halfWidth = Math.min(
    Math.round(sigma * 2),
    Math.max(1, Math.floor(Math.sqrt(runs) * sigma * 0.45)),
  );
  const step = Math.max(1, Math.round((2 * halfWidth + 1) / 12));
  const jitter = 1.6 / Math.sqrt(runs);

  const bins: (readonly [number, number])[] = [];
  for (let offset = -halfWidth; offset <= halfWidth; offset += step) {
    const weight = Math.exp(-((offset / sigma) ** 2) * 1.5) * runs;
    const noise = 1 + jitter * (storyNoise(frameNumber, offset) - 0.5) * 2;
    const frequency = Math.round(weight * noise);
    if (frequency > 0 && center + offset >= 0) {
      bins.push([center + offset, frequency]);
    }
  }
  if (bins.length === 0) {
    bins.push([Math.max(0, center), runs]);
  }

  return {
    metricId: "infected",
    label: "Infected",
    outputType: "distribution" as const,
    frameNumber,
    time: frameNumber,
    bins,
    value: null,
    frameValue: null,
    timeValue: null,
    runSampleCount: runs,
    timeSampleCount: runs,
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
  computeBackend: input.computeBackend ?? "cpu",
  computeBackendFallbackReason: null,
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
});

export function FakeExperimentsProvider({
  children,
  initialExperiments,
  overrides,
  restreamOnSelectionChange = false,
}: {
  children: ReactNode;
  initialExperiments: readonly ExperimentRecord[];
  /**
   * Per-story replacements for the fake compute callbacks — e.g. a slower
   * sampler to watch a surface fill in, or one that resolves null to show
   * the empty state.
   */
  overrides?: Partial<Pick<ExperimentsContextValue, "navigateSweep">>;
  /**
   * Simulates what the real sweep session does on a selection change:
   * frames clear immediately, then the new selection's distribution streams
   * back in after a compute gap.
   */
  restreamOnSelectionChange?: boolean;
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
    ...overrides,
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
  const [simulateViewMode, setSimulateViewMode] = useState<SimulateViewMode>(
    initialSimulateViewMode,
  );
  // Stateful so stories that mount SimulationCreationDrawer can open it.
  const [simulateDrawer, setSimulateDrawer] = useState<SimulateDrawerState>({
    type: "closed",
  });
  // Stateful so the optimization stories can open a record as the whole section.
  const [simulatePresentation, setSimulatePresentation] =
    useState<PetrinautSimulatePresentation>("drawer");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const value: EditorContextValue = {
    ...initialEditorState,
    globalMode: "simulate",
    simulateViewMode,
    navigateTo: () => {},
    setGlobalMode: () => {},
    setEditionMode: () => {},
    setAddComponentMode: () => {},
    setCursorMode: () => {},
    setLeftSidebarOpen: () => {},
    setLeftSidebarWidth: () => {},
    setPropertiesPanelWidth: () => {},
    setAiAssistantWidth: () => {},
    setBottomPanelOpen: () => {},
    toggleBottomPanel: () => {},
    setBottomPanelHeight: () => {},
    setActiveBottomPanelTab: () => {},
    isSelected: () => false,
    setSelection: () => {},
    beginSelectionGesture: () => {},
    endSelectionGesture: () => {},
    selectItem: () => {},
    toggleItem: () => {},
    clearSelection: () => {},
    setHoveredItem: () => {},
    clearHoveredItem: () => {},
    toggleVisualizerPin: () => {},
    openPlaceVisualizer: () => {},
    setDraggingStateByNodeId: () => {},
    updateDraggingStateByNodeId: () => {},
    simulateDrawer,
    setSimulateDrawer,
    simulatePresentation,
    setSimulatePresentation,
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
    searchInputRef,
  };

  return <EditorContext value={value}>{children}</EditorContext>;
}
