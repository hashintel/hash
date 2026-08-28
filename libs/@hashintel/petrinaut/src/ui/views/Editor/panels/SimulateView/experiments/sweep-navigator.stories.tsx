import { useState } from "react";

import { fullSweepSelection } from "../../../../../../react/experiments/parameter-grid";
import { SweepNavigator, type SweepNavigatorStatus } from "./sweep-navigator";

import type {
  ExperimentParameterAxis,
  SweepSelection,
} from "../../../../../../react/experiments/parameter-grid";
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
