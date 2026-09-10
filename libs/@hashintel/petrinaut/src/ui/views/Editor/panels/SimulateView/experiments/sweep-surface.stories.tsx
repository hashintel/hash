import { use } from "react";

import { ExperimentsContext } from "../../../../../../react/experiments/context";
import {
  FakeExperimentsProvider,
  makeParameterSweepExperiment,
} from "./experiments-story-fixtures";
import { SweepSurface } from "./sweep-surface";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Simulate / SweepSurface",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const visited = makeParameterSweepExperiment();

/** The same sweep before anything computed: no point yet, the full range selected. */
const untouched: ExperimentRecord = {
  ...visited,
  status: "idle",
  metricFrames: [],
  latestMetricFramesById: {},
  sweep: {
    selection: {
      transmission_rate: { from: 0, to: 50 },
      recovery_days: { from: 0, to: 18 },
    },
    selectionKey: "transmission_rate=0..50|recovery_days=0..18",
    runsCompleted: 0,
    runsSampled: 0,
    runTarget: null,
    computing: false,
    visited: [],
  },
};

/**
 * Reads the record back out of the provider, so a pick's selection change
 * reaches the surface the way it does in the drawer.
 */
const LiveSweepSurface = ({ following }: { following?: boolean }) => {
  const { experiments } = use(ExperimentsContext);
  const record = experiments.find((candidate) => candidate.sweep !== null);
  return record ? (
    <SweepSurface
      experiment={record}
      following={following}
      tone={following ? "optimizing" : undefined}
    />
  ) : null;
};

const SweepSurfaceStory = ({
  experiment,
  following,
}: {
  experiment: ExperimentRecord;
  following?: boolean;
}) => (
  <FakeExperimentsProvider
    initialExperiments={[experiment]}
    restreamOnSelectionChange
  >
    <div style={{ width: 560 }}>
      <LiveSweepSurface following={following} />
    </div>
  </FakeExperimentsProvider>
);

/** Five points visited, the selected one computing: click or drag to add one. */
export const Visited: Story = {
  name: "Visited points",
  render: () => <SweepSurfaceStory experiment={visited} />,
};

/** A fresh sweep: nothing computed, the plot waits for a pick. */
export const Empty: Story = {
  name: "Empty",
  render: () => <SweepSurfaceStory experiment={untouched} />,
};

/** An optimizer drives the selection: display only, in the optimizing tone. */
export const Following: Story = {
  name: "Following the optimizer",
  render: () => <SweepSurfaceStory experiment={visited} following />,
};
