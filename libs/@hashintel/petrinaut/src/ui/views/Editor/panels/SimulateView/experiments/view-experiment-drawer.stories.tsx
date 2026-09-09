/**
 * The sweep-experiment drawer against fake compute: drag a parameter slider
 * and the charts bridge the compute gap with the previous picture, dimmed,
 * until the new selection's first frames arrive.
 */
import { use } from "react";

import {
  type ExperimentRecord,
  ExperimentsContext,
} from "../../../../../../react/experiments/context";
import {
  FakeExperimentsProvider,
  makeExperiment,
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

/** A plain experiment: no parameters, no surface, the metric cards alone under the header. */
const plainExperiment = (
  status: ExperimentRecord["status"],
): ExperimentRecord =>
  makeExperiment(1, {
    name: "SIR Monte Carlo",
    status,
    metricSpecs: makeParameterSweepExperiment().metricSpecs,
    metricFrames: makeParameterSweepExperiment().metricFrames,
  });

export const Running: Story = {
  name: "Plain experiment, running",
  render: () => (
    <FakeExperimentsProvider initialExperiments={[plainExperiment("running")]}>
      <DrawerFromContext />
    </FakeExperimentsProvider>
  ),
};

export const Complete: Story = {
  name: "Plain experiment, complete",
  render: () => (
    <FakeExperimentsProvider initialExperiments={[plainExperiment("complete")]}>
      <DrawerFromContext />
    </FakeExperimentsProvider>
  ),
};
