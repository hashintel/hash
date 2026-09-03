import { use } from "react";

import { ExperimentsContext } from "../../../../../../react/experiments/context";
import {
  FakeExperimentsProvider,
  makeParameterSweepExperiment,
} from "./experiments-story-fixtures";
import { SweepSurface } from "./sweep-surface";

import type { ExperimentsContextValue } from "../../../../../../react/experiments/context";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Simulate / SweepSurface",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const experiment = makeParameterSweepExperiment();

/**
 * Reads the record back out of the provider, so a click's selection change
 * reaches the surface the way it does in the drawer.
 */
const LiveSweepSurface = () => {
  const { experiments } = use(ExperimentsContext);
  const record = experiments.find((candidate) => candidate.sweep !== null);
  return record ? <SweepSurface experiment={record} /> : null;
};

const SweepSurfaceStory = ({
  overrides,
}: {
  overrides?: Partial<Pick<ExperimentsContextValue, "sampleSweepCell">>;
}) => (
  <FakeExperimentsProvider
    initialExperiments={[experiment]}
    overrides={overrides}
  >
    <div style={{ width: 560 }}>
      <LiveSweepSurface />
    </div>
  </FakeExperimentsProvider>
);

export const Streaming: Story = {
  name: "Streaming",
  render: () => <SweepSurfaceStory />,
};

/** Sampling slowed to 600 ms per point, to watch the coarse-to-fine walk. */
const slowSampler: Pick<ExperimentsContextValue, "sampleSweepCell"> = {
  sampleSweepCell: (_experimentId, position) => {
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
        600,
      );
    });
  },
};

export const SlowSampling: Story = {
  name: "Slow sampling",
  render: () => <SweepSurfaceStory overrides={slowSampler} />,
};

export const NoData: Story = {
  name: "No data",
  render: () => (
    <SweepSurfaceStory
      overrides={{ sampleSweepCell: () => Promise.resolve(null) }}
    />
  ),
};
