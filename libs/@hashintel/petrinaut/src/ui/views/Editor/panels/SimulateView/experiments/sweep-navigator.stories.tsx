import { use, useEffect, useRef, useState } from "react";

import { sirModel } from "@hashintel/petrinaut-core/examples";

import { ExperimentsContext } from "../../../../../../react/experiments/context";
import {
  axisValueAt,
  fullSweepSelection,
} from "../../../../../../react/experiments/parameter-grid";
import { ExperimentsProvider } from "../../../../../../react/experiments/provider";
import { LanguageClientProvider } from "../../../../../../react/lsp/provider";
import { NotificationsProvider } from "../../../../../../react/notifications/provider";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { UserSettingsProvider } from "../../../../../../react/state/user-settings-provider";
import { MonacoProvider } from "../../../../../monaco/provider";
import { ExperimentMetricTimeline } from "./experiment-metric-timeline";
import {
  sirInfectedFrame,
  sirSdcpnContextValue,
} from "./experiments-story-fixtures";
import { SweepNavigator, type SweepNavigatorStatus } from "./sweep-navigator";

import type {
  ExperimentComputeBackend,
  ExperimentRecord,
} from "../../../../../../react/experiments/context";
import type {
  ExperimentParameterAxis,
  SweepAxisSelection,
  SweepSelection,
} from "../../../../../../react/experiments/parameter-grid";
import type { SDCPNContextValue } from "../../../../../../react/state/sdcpn-context";
import type { MetricSize } from "./experiment-metric-timeline";
import type { SDCPN } from "@hashintel/petrinaut-core";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Simulate / SweepNavigator",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/** A continuous rate and a coarse integer axis, like the SIR sweep's. */
const axes: ExperimentParameterAxis[] = [
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
];

const idleStatus: SweepNavigatorStatus = {
  computing: false,
  runsCompleted: 25,
  runsSampled: 25,
  runTarget: null,
  runCount: 100,
};

/** Sliders commit into local state, so every story is fully interactive. */
const StatefulNavigator = ({
  initialSelection,
  status,
}: {
  initialSelection: SweepSelection;
  status: SweepNavigatorStatus;
}) => {
  const [selection, setSelection] = useState<SweepSelection>(initialSelection);
  return (
    <div style={{ width: 560 }}>
      <SweepNavigator
        axes={axes}
        selection={selection}
        status={status}
        onSelectionChange={setSelection}
      />
    </div>
  );
};

export const FullRanges: Story = {
  name: "Full ranges",
  render: () => (
    <StatefulNavigator
      initialSelection={fullSweepSelection(axes)}
      status={idleStatus}
    />
  ),
};

export const PointSelection: Story = {
  name: "Point selection",
  render: () => (
    <StatefulNavigator
      initialSelection={{
        transmission_rate: { from: 25, to: 25 },
        recovery_days: { from: 6, to: 6 },
      }}
      status={idleStatus}
    />
  ),
};

export const MixedSelection: Story = {
  name: "Range and point mixed",
  render: () => (
    <StatefulNavigator
      initialSelection={{
        transmission_rate: { from: 10, to: 38 },
        recovery_days: { from: 6, to: 6 },
      }}
      status={idleStatus}
    />
  ),
};

export const SamplingRanges: Story = {
  name: "Sampling across ranges",
  render: () => (
    <StatefulNavigator
      initialSelection={fullSweepSelection(axes)}
      status={{
        computing: true,
        runsCompleted: 25,
        runsSampled: 61,
        runTarget: 100,
        runCount: 100,
      }}
    />
  ),
};

export const RefiningPoint: Story = {
  name: "Refining a point",
  render: () => (
    <StatefulNavigator
      initialSelection={{
        transmission_rate: { from: 25, to: 25 },
        recovery_days: { from: 6, to: 6 },
      }}
      status={{
        computing: true,
        runsCompleted: 8,
        runsSampled: 19,
        runTarget: 25,
        runCount: 100,
      }}
    />
  ),
};

type MetricFrame = ExperimentRecord["metricFrames"][number];

const STREAM_FRAME_COUNT = 46;
const STREAM_TICK_MS = 90;

const selectionOf = (
  axis: ExperimentParameterAxis,
  selection: SweepSelection,
): SweepAxisSelection =>
  selection[axis.identifier] ?? { from: 0, to: axis.stepCount };

/**
 * The navigator wired to a fake sweep session over the SIR Seasonal Flu
 * scenario: committing a slider move drops the streamed frames and restarts
 * the "Infected" metric streaming for the new selection — its curve derives
 * from the selected transmission rate and recovery time, and a range
 * selection widens the run distribution the way per-run parameter draws do.
 */
const NavigatorWithStreamingMetrics = () => {
  const [selection, setSelection] = useState<SweepSelection>({
    transmission_rate: { from: 25, to: 25 },
    recovery_days: { from: 6, to: 6 },
  });
  const [frames, setFrames] = useState<MetricFrame[]>([]);
  const [metricSize, setMetricSize] = useState<MetricSize>("large");

  // The synthetic model's inputs, as primitives so the streaming effect can
  // key on exactly what changes the curve.
  const [transmissionAxis, recoveryAxis] = axes as [
    ExperimentParameterAxis,
    ExperimentParameterAxis,
  ];
  const transmissionRange = selectionOf(transmissionAxis, selection);
  const recoveryRange = selectionOf(recoveryAxis, selection);
  const midValue = (
    axis: ExperimentParameterAxis,
    range: SweepAxisSelection,
  ): number =>
    (axisValueAt(axis, range.from) + axisValueAt(axis, range.to)) / 2;
  const spanValue = (
    axis: ExperimentParameterAxis,
    range: SweepAxisSelection,
  ): number => axisValueAt(axis, range.to) - axisValueAt(axis, range.from);
  const transmissionRate = midValue(transmissionAxis, transmissionRange);
  const recoveryDays = midValue(recoveryAxis, recoveryRange);
  // A range selection's runs draw different parameter values, so the run
  // distribution widens with the selected spans.
  const spread =
    5 +
    spanValue(transmissionAxis, transmissionRange) * 60 +
    spanValue(recoveryAxis, recoveryRange) * 1.5;

  // A new selection restarts the stream; clearing during render (not in the
  // effect) repaints without a stale chart.
  const streamKey = `${transmissionRate}|${recoveryDays}|${spread}`;
  const [prevStreamKey, setPrevStreamKey] = useState(streamKey);
  if (prevStreamKey !== streamKey) {
    setPrevStreamKey(streamKey);
    setFrames([]);
  }

  // The fake session: streams one frame per tick for the current selection.
  useEffect(() => {
    let frameNumber = 0;
    const timer = setInterval(() => {
      if (frameNumber >= STREAM_FRAME_COUNT) {
        clearInterval(timer);
        return;
      }
      const frame = sirInfectedFrame({
        frameNumber,
        transmissionRate,
        recoveryDays,
        spread,
        runs: 25,
      });
      frameNumber++;
      setFrames((previous) => [...previous, frame]);
    }, STREAM_TICK_MS);
    return () => clearInterval(timer);
  }, [transmissionRate, recoveryDays, spread]);

  const streaming = frames.length < STREAM_FRAME_COUNT;
  const status: SweepNavigatorStatus = {
    computing: streaming,
    runsCompleted: streaming ? 0 : 25,
    runsSampled: Math.round((25 * frames.length) / STREAM_FRAME_COUNT),
    runTarget: streaming ? 25 : null,
    runCount: 100,
  };

  return (
    <div
      style={{
        width: 640,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <SweepNavigator
        axes={axes}
        selection={selection}
        status={status}
        onSelectionChange={setSelection}
      />
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: 12,
        }}
      >
        <ExperimentMetricTimeline
          frames={frames}
          label="Infected"
          timeDomain={[0, STREAM_FRAME_COUNT - 1]}
          displaySize={metricSize}
          onDisplaySizeChange={setMetricSize}
        />
      </div>
    </div>
  );
};

export const WithStreamingMetrics: Story = {
  name: "With streaming metrics (SIR)",
  render: () => <NavigatorWithStreamingMetrics />,
};

export const FullySampled: Story = {
  name: "Fully sampled",
  render: () => (
    <StatefulNavigator
      initialSelection={{
        transmission_rate: { from: 25, to: 25 },
        recovery_days: { from: 6, to: 6 },
      }}
      status={{
        computing: false,
        runsCompleted: 100,
        runsSampled: 100,
        runTarget: null,
        runCount: 100,
      }}
    />
  ),
};

// -- Real compute ------------------------------------------------------------

/**
 * A story-only SIR scenario whose swept parameters drive the transition
 * rates through `parameterOverrides` — so ranging them genuinely changes
 * each run's dynamics. (The stock scenarios' parameters only shape the
 * initial marking, which a range holds at its midpoint.) Token counts stay
 * well inside the metric histogram's bin range, so point selections are
 * GPU-eligible.
 */
const REAL_SWEEP_SCENARIO_ID = "scenario__story_rate_sweep";

const realSweepDefinition: SDCPN = {
  ...sirModel.petriNetDefinition,
  scenarios: [
    ...(sirModel.petriNetDefinition.scenarios ?? []),
    {
      id: REAL_SWEEP_SCENARIO_ID,
      name: "Rate sweep",
      description:
        "Feeds the infection and recovery rates from swept scenario parameters.",
      scenarioParameters: [
        { type: "real", identifier: "transmission_rate", default: 1.5 },
        { type: "real", identifier: "recovery_rate", default: 0.8 },
      ],
      parameterOverrides: {
        param__infection_rate: "scenario.transmission_rate",
        param__recovery_rate: "scenario.recovery_rate",
      },
      initialState: {
        type: "per_place",
        content: {
          place__susceptible: "190",
          place__infected: "10",
          place__recovered: "0",
        },
      },
    },
  ],
};

const realSweepSdcpnContextValue: SDCPNContextValue = {
  ...sirSdcpnContextValue,
  petriNetDefinition: realSweepDefinition,
};

const realSweepHintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#888",
  margin: 0,
};

/**
 * The navigator against the real experiments provider: a genuine sweep
 * experiment simulates in browser workers, and moving a slider redirects
 * real compute. With the GPU requested, range selections upload each run's
 * parameter draw to a per-run buffer and run on the GPU too — collapse both
 * parameters to points and the GPU takes over.
 */
type RealSweepConfig = {
  runCount: number;
  maxTime: number;
  dt: number;
};

const RealSweepSession = ({
  computeBackend,
  runCount,
  maxTime,
  dt,
}: RealSweepConfig & {
  computeBackend: ExperimentComputeBackend;
}) => {
  const { experiments, createExperiment, setSweepSelection } =
    use(ExperimentsContext);
  const startedRef = useRef(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [metricSize, setMetricSize] = useState<MetricSize>("large");

  useEffect(() => {
    // Once per story lifetime, surviving StrictMode's double-invoked mount.
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    createExperiment({
      name: "Real rate sweep",
      scenarioId: REAL_SWEEP_SCENARIO_ID,
      scenarioParameterValues: {
        transmission_rate: { mode: "range", min: 0.5, max: 4 },
        recovery_rate: { mode: "range", min: 0.2, max: 1.5 },
      },
      runCount,
      seed: 42,
      dt,
      maxTime,
      metricSpecs: [
        {
          kind: "placeTokenCountMean",
          id: "infected",
          label: "Infected",
          placeId: "place__infected",
          runOutput: { type: "distribution", binning: "exact" },
        },
      ],
      computeBackend,
    }).catch((cause: unknown) => setCreateError(String(cause)));
  }, [computeBackend, createExperiment, dt, maxTime, runCount]);

  const experiment = experiments.find((candidate) => candidate.sweep !== null);

  if (createError) {
    return <p style={{ color: "#b91c1c" }}>{createError}</p>;
  }
  if (!experiment?.sweep) {
    return <p style={realSweepHintStyle}>Compiling the scenario…</p>;
  }

  return (
    <div
      style={{
        width: 640,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <p style={realSweepHintStyle}>
        Batches ran on{" "}
        {experiment.computeBackend === "webgpu" ? "the GPU" : "the CPU"}
        {experiment.computeBackendFallbackReason
          ? ` — ${experiment.computeBackendFallbackReason}`
          : ""}
        {computeBackend === "webgpu"
          ? " · ranges upload each run's parameter draw to the GPU, so range and point selections both run there when the net qualifies"
          : ""}
      </p>
      <SweepNavigator
        axes={experiment.parameterAxes}
        selection={experiment.sweep.selection}
        status={{
          computing: experiment.sweep.computing,
          runsCompleted: experiment.sweep.runsCompleted,
          runsSampled: experiment.sweep.runsSampled,
          runTarget: experiment.sweep.runTarget,
          runCount: experiment.runCount,
        }}
        onSelectionChange={(selection) =>
          setSweepSelection(experiment.id, selection)
        }
      />
      <div
        style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}
      >
        <ExperimentMetricTimeline
          frames={experiment.metricFrames}
          label="Infected"
          timeDomain={[0, maxTime]}
          displaySize={metricSize}
          onDisplaySizeChange={setMetricSize}
        />
      </div>
    </div>
  );
};

const RealSweepStory = ({
  computeBackend,
  runCount,
  maxTime,
  dt,
}: RealSweepConfig & {
  computeBackend: ExperimentComputeBackend;
}) => (
  <SDCPNContext value={realSweepSdcpnContextValue}>
    <LanguageClientProvider>
      <MonacoProvider>
        <NotificationsProvider>
          <UserSettingsProvider>
            <ExperimentsProvider>
              <RealSweepSession
                computeBackend={computeBackend}
                runCount={runCount}
                maxTime={maxTime}
                dt={dt}
              />
            </ExperimentsProvider>
          </UserSettingsProvider>
        </NotificationsProvider>
      </MonacoProvider>
    </LanguageClientProvider>
  </SDCPNContext>
);

/**
 * Storybook controls for the real-compute stories. Changing one remounts
 * the story (the render key), which starts a fresh experiment with the new
 * settings. The run ladder climbs ×5/×2 past 1000, so budgets like 100 000
 * refine in the same escalating batches the app uses.
 */
const realSweepArgs: RealSweepConfig = {
  runCount: 1_000,
  maxTime: 60,
  dt: 0.5,
};
const realSweepArgTypes = {
  runCount: { control: { type: "number", min: 8, max: 10_000_000, step: 1 } },
  maxTime: { control: { type: "number", min: 5, max: 600, step: 5 } },
  dt: { control: { type: "number", min: 0.05, max: 5, step: 0.05 } },
} as const;
const realSweepKey = (prefix: string, config: RealSweepConfig) =>
  `${prefix}-${config.runCount}-${config.maxTime}-${config.dt}`;

export const RealCpuSweep: StoryObj<RealSweepConfig> = {
  name: "Real compute on CPU",
  args: realSweepArgs,
  argTypes: realSweepArgTypes,
  render: (args) => (
    <RealSweepStory
      key={realSweepKey("cpu", args)}
      computeBackend="cpu"
      {...args}
    />
  ),
};

export const RealGpuSweep: StoryObj<RealSweepConfig> = {
  name: "Real compute on GPU (points)",
  args: realSweepArgs,
  argTypes: realSweepArgTypes,
  render: (args) => (
    <RealSweepStory
      key={realSweepKey("gpu", args)}
      computeBackend="webgpu"
      {...args}
    />
  ),
};
