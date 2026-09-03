/**
 * The sweep-experiment drawer against fake compute: drag a parameter slider
 * and the charts bridge the compute gap with the previous picture, dimmed,
 * until the new selection's first frames arrive.
 */
import { use } from "react";

import { ExperimentsContext } from "../../../../../../react/experiments/context";
import {
  FakeExperimentsProvider,
  makeParameterSweepExperiment,
} from "./experiments-story-fixtures";
import { ViewExperimentDrawer } from "./view-experiment-drawer";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Simulate / ViewExperimentDrawer",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const DrawerFromContext = () => {
  const { experiments } = use(ExperimentsContext);
  return (
    <ViewExperimentDrawer open onClose={() => {}} experiment={experiments[0]} />
  );
};

export const Sweep: Story = {
  render: () => (
    <FakeExperimentsProvider
      initialExperiments={[makeParameterSweepExperiment()]}
      restreamOnSelectionChange
    >
      <DrawerFromContext />
    </FakeExperimentsProvider>
  ),
};
