import { css } from "@hashintel/ds-helpers/css";

import {
  FakeExperimentsProvider,
  makeExperiment,
  makeProgress,
  multipleExperiments,
  oneExperiment,
} from "../../panels/SimulateView/experiments/experiments-story-fixtures";
import { RunningExperimentsPopover } from "./running-experiments-popover";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Experiments / RunningExperimentsPopover",
  component: RunningExperimentsPopover,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof RunningExperimentsPopover>;

export default meta;

type Story = StoryObj<typeof meta>;

const rootStyle = css({
  minWidth: "[360px]",
  minHeight: "[180px]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "neutral.s00",
});

const RunningExperimentsPopoverStory = ({
  experiments,
}: {
  experiments: Parameters<
    typeof FakeExperimentsProvider
  >[0]["initialExperiments"];
}) => {
  return (
    <FakeExperimentsProvider initialExperiments={experiments}>
      <div className={`${rootStyle} petrinaut-root`}>
        <RunningExperimentsPopover />
      </div>
    </FakeExperimentsProvider>
  );
};

export const None: Story = {
  render: () => <RunningExperimentsPopoverStory experiments={[]} />,
};

export const One: Story = {
  render: () => (
    <RunningExperimentsPopoverStory experiments={[oneExperiment]} />
  ),
};

export const Multiple: Story = {
  render: () => (
    <RunningExperimentsPopoverStory experiments={multipleExperiments} />
  ),
};

export const Initializing: Story = {
  render: () => (
    <RunningExperimentsPopoverStory
      experiments={[
        makeExperiment(1, { status: "initializing", progress: null }),
      ]}
    />
  ),
};

export const InProgress: Story = {
  name: "In progress",
  render: () => (
    <RunningExperimentsPopoverStory
      experiments={[
        makeExperiment(1, {
          status: "running",
          progress: makeProgress({
            activeRuns: 420,
            completedRuns: 580,
            frameNumber: 96,
            time: 96,
          }),
        }),
      ]}
    />
  ),
};

export const Complete: Story = {
  render: () => (
    <RunningExperimentsPopoverStory
      experiments={[makeExperiment(1, { status: "complete" })]}
    />
  ),
};
