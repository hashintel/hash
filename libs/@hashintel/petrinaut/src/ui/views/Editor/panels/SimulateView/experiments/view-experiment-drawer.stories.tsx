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
import { PetrinautOptimizationContext } from "../../../../../../react/optimization-context";
import {
  foldBestTrial,
  type OptimizationBest,
  type OptimizationRecord,
  OptimizationsContext,
} from "../../../../../../react/optimizations/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import {
  fakeStudyInput,
  fakeStudyTrials,
  makeOptimizationRecord,
  makeOptimizationsContextValue,
} from "../optimizations/optimizations-story-fixtures";
import { WithUserSettings } from "../simulate-view-story-harness";
import {
  FakeExperimentsProvider,
  makeExperiment,
  makeParameterSweepExperiment,
  sirSdcpnContextValue,
} from "./experiments-story-fixtures";
import { ViewExperimentDrawer } from "./view-experiment-drawer";

import type { PetrinautConnectedOptimization } from "@hashintel/petrinaut-core/optimization";
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

/** The two-axis sweep with four metrics: the common case the drawer must show without scrolling. */
const fourMetricSweep = (): ExperimentRecord => {
  const sweep = makeParameterSweepExperiment();
  const infected = sweep.metricSpecs[0]!;
  return {
    ...sweep,
    metricSpecs: [
      infected,
      { ...infected, id: "susceptible", label: "Susceptible" },
      { ...infected, id: "recovered", label: "Recovered" },
      { ...infected, id: "hospitalised", label: "Hospitalised" },
    ],
  };
};

export const FourMetrics: Story = {
  name: "Sweep, four metrics",
  render: () => (
    <FakeExperimentsProvider
      initialExperiments={[fourMetricSweep()]}
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

/** A connected optimizer the fake optimizations context never connects. */
const storyOptimizer: PetrinautConnectedOptimization = {
  kind: "connected",
  connect: () => {
    throw new Error("The story's optimizer is never connected");
  },
};

/** A study started from the sweep, its first `steps` fake trials landed and its best among them. */
const sweepStudy = (
  sweep: ExperimentRecord,
  {
    id,
    status,
    steps,
    startedAgoMs,
  }: {
    id: string;
    status: OptimizationRecord["status"];
    steps: number;
    startedAgoMs: number;
  },
): OptimizationRecord => {
  const trials = fakeStudyTrials.trials.slice(0, steps);
  return {
    ...makeOptimizationRecord({
      input: fakeStudyInput,
      status,
      trials,
      best: trials.reduce<OptimizationBest | null>(
        (best, event) => foldBestTrial("maximize", best, event),
        null,
      ),
    }),
    id,
    createdAt: Date.now() - startedAgoMs,
    origin: { kind: "sweep", experimentId: sweep.id },
  };
};

/**
 * The sweep drawer with the in-browser optimizer available: the Parameters
 * card offers Optimize, and with a study driving the sweep it turns purple,
 * the header reads Optimizing, its sliders follow the steps, the button
 * reads Stop and the objective strip under the sliders fills in step by
 * step. Settled, the strip keeps the whole history; `previous` adds an
 * earlier, stopped study before it, so the strip shows the two end to end
 * with a divider where the second began.
 */
const OptimizableSweep = ({
  driving,
  previous = false,
}: {
  driving: boolean;
  previous?: boolean;
}) => {
  const sweep = makeParameterSweepExperiment();
  const study = sweepStudy(sweep, {
    id: "sweep-study-2",
    status: driving ? "running" : "complete",
    steps: driving ? 4 : 30,
    startedAgoMs: 90_000,
  });
  const studies = previous
    ? [
        study,
        sweepStudy(sweep, {
          id: "sweep-study-1",
          status: "cancelled",
          steps: 17,
          startedAgoMs: 600_000,
        }),
      ]
    : [study];
  return (
    <WithUserSettings overrides={{ enableInBrowserOptimization: true }}>
      <PetrinautOptimizationContext value={storyOptimizer}>
        <SDCPNContext value={sirSdcpnContextValue}>
          <OptimizationsContext
            value={makeOptimizationsContextValue(study, {
              // Newest first, as the provider keeps them.
              optimizations: studies,
              selectedOptimization: null,
              selectedOptimizationId: null,
            })}
          >
            <FakeExperimentsProvider
              initialExperiments={[sweep]}
              restreamOnSelectionChange
            >
              <DrawerFromContext />
            </FakeExperimentsProvider>
          </OptimizationsContext>
        </SDCPNContext>
      </PetrinautOptimizationContext>
    </WithUserSettings>
  );
};

export const Optimizable: Story = {
  name: "Sweep, optimizer available",
  render: () => <OptimizableSweep driving={false} />,
};

export const Optimizing: Story = {
  name: "Sweep, optimizer driving",
  render: () => <OptimizableSweep driving />,
};

export const OptimizedTwice: Story = {
  name: "Sweep, optimized twice",
  render: () => <OptimizableSweep driving previous />,
};
