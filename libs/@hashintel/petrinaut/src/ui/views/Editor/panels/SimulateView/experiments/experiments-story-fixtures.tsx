import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "@hashintel/petrinaut-core";
import { sirModel } from "@hashintel/petrinaut-core/examples";

import {
  type CreateExperimentInput,
  ExperimentsContext,
  type ExperimentRecord,
  type ExperimentsContextValue,
  isTerminalExperimentStatus,
} from "../../../../../../react/experiments/context";
import {
  EditorContext,
  initialEditorState,
  type EditorContextValue,
  type SimulateDrawerState,
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
    ...overrides,
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
      runsCompleted: 25,
      runsSampled: 61,
      runTarget: 100,
      computing: true,
    },
    metricFrames: frames,
    latestMetricFramesById: { infected: frames.at(-1)! },
  });
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
  overrides?: Partial<
    Pick<ExperimentsContextValue, "sampleSweepCell" | "sampleDetachedObjective">
  >;
  /**
   * Simulates what the real sweep session does on a selection change:
   * frames clear immediately, then the new selection's distribution streams
   * back in after a compute gap — the case restream ghosting exists for.
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
            },
          };
        }),
      );
      if (upTo < 46) {
        restreamRef.current.timer = setTimeout(step, 160);
      }
    };
    // The compute gap: what the charts bridge with the restream ghost.
    restreamRef.current.timer = setTimeout(step, 900);
  };

  const value: ExperimentsContextValue = {
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
    sampleDetachedObjective: (request) => {
      // The same synthetic bump as sampleSweepCell, over the study's real
      // parameter values, so the optimization surface story fills live.
      const values = Object.values(request.scenarioParameterValues).filter(
        (entry): entry is number => typeof entry === "number",
      );
      const x = values[0] ?? 0;
      const y = values[1] ?? 0;
      const objective =
        100 * Math.exp(-((x - 0.35) ** 2) * 20 - ((y - 10) / 14) ** 2) +
        6 * Math.sin(x * 9) +
        y / 4;
      const frame = {
        metricId: request.metric.id,
        label: request.metric.label,
        outputType: "distribution" as const,
        frameNumber: 45,
        time: 45,
        bins: [
          [Math.round(objective * 100) / 100, request.runCount],
        ] as (readonly [number, number])[],
        value: null,
        frameValue: null,
        timeValue: null,
        runSampleCount: request.runCount,
        timeSampleCount: request.runCount,
      };
      return new Promise((resolve) => {
        setTimeout(
          () =>
            resolve({
              runsCompleted: request.runCount,
              metricFrames: [frame],
            }),
          100,
        );
      });
    },
    setSweepSelection: (experimentId, selection) => {
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
                    runsCompleted: 0,
                    runsSampled: 0,
                    runTarget: 8,
                    computing: true,
                  },
                }
              : { ...experiment, sweep: { ...experiment.sweep, selection } }
            : experiment,
        ),
      );
      if (restreamOnSelectionChange) {
        restream(experimentId, selection);
      }
    },
    sampleSurfaceCells: (_experimentId, positions) =>
      // The same synthetic bump as sampleSweepCell, one walk delay per chunk.
      new Promise((resolve) => {
        setTimeout(() => {
          resolve(
            positions.map((position) => {
              const x = 0.1 + ((position.transmission_rate ?? 0) / 50) * 0.4;
              const y = 2 + (position.recovery_days ?? 0);
              const objective =
                100 * Math.exp(-((x - 0.35) ** 2) * 20 - ((y - 10) / 14) ** 2) +
                6 * Math.sin(x * 9) +
                y / 4;
              return { infected: Math.round(objective) };
            }),
          );
        }, 120);
      }),
    sampleSweepCell: (_experimentId, position) => {
      // A synthetic objective surface — a smooth bump — so the story's
      // contour fills in the way a real sweep's would, walk delay included.
      // Positions are quantized indices; map them back to values.
      const x = 0.1 + ((position.transmission_rate ?? 0) / 50) * 0.4;
      const y = 2 + (position.recovery_days ?? 0);
      const objective =
        100 * Math.exp(-((x - 0.35) ** 2) * 20 - ((y - 10) / 14) ** 2) +
        6 * Math.sin(x * 9) +
        y / 4;
      const frame = {
        metricId: "infected",
        label: "Infected",
        outputType: "distribution" as const,
        frameNumber: 45,
        time: 45,
        bins: [[Math.round(objective), 8]] as (readonly [number, number])[],
        value: null,
        frameValue: null,
        timeValue: null,
        runSampleCount: 8,
        timeSampleCount: 8,
      };
      return new Promise((resolve) => {
        setTimeout(
          () => resolve({ runsCompleted: 8, metricFrames: [frame] }),
          120,
        );
      });
    },
    ...overrides,
  };

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
  // Stateful so stories that mount SimulationCreationDrawer can open it.
  const [simulateDrawer, setSimulateDrawer] = useState<SimulateDrawerState>({
    type: "closed",
  });
  const searchInputRef = useRef<HTMLInputElement>(null);

  const value = useMemo<EditorContextValue>(
    () => ({
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
      setBottomPanelOpen: () => {},
      toggleBottomPanel: () => {},
      setBottomPanelHeight: () => {},
      setActiveBottomPanelTab: () => {},
      isSelected: () => false,
      isSelectedConnection: () => false,
      isNotSelectedConnection: () => false,
      selectedConnections: new Map(),
      setSelection: () => {},
      beginSelectionGesture: () => {},
      endSelectionGesture: () => {},
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
      simulateDrawer,
      setSimulateDrawer,
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
    }),
    [simulateDrawer, simulateViewMode],
  );

  return <EditorContext value={value}>{children}</EditorContext>;
}
