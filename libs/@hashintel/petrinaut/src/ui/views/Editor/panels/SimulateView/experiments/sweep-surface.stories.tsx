import { use } from "react";

import { ExperimentsContext } from "../../../../../../react/experiments/context";
import {
  FakeExperimentsProvider,
  makeFakeSurfaceSampler,
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
 * Reads the record back out of the provider, so a pick's selection change
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
  overrides?: Partial<Pick<ExperimentsContextValue, "sampleSurfaceCells">>;
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

/** Sampling slowed to 600 ms per chunk, to watch the quad-tree walk. */
export const SlowSampling: Story = {
  name: "Slow sampling",
  render: () => (
    <SweepSurfaceStory
      overrides={{ sampleSurfaceCells: makeFakeSurfaceSampler(600) }}
    />
  ),
};

export const NoData: Story = {
  name: "No data",
  render: () => (
    <SweepSurfaceStory
      overrides={{ sampleSurfaceCells: () => Promise.resolve(null) }}
    />
  ),
};
