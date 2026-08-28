import { useEffect, useState } from "react";

import {
  axisValueAt,
  fullSweepSelection,
} from "../../../../../../react/experiments/parameter-grid";
import { ExperimentMetricTimeline } from "./experiment-metric-timeline";
import { sirInfectedFrame } from "./experiments-story-fixtures";
import { SweepNavigator, type SweepNavigatorStatus } from "./sweep-navigator";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";
import type {
  ExperimentParameterAxis,
  SweepAxisSelection,
  SweepSelection,
} from "../../../../../../react/experiments/parameter-grid";
import type { MetricSize } from "./experiment-metric-timeline";
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
