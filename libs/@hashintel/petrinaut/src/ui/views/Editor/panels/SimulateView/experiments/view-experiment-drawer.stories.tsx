/**
 * The sweep-experiment drawer against fake compute: drag a parameter slider
 * and the charts bridge the compute gap with the previous picture, dimmed,
 * until the new selection's first frames arrive. With the in-browser
 * optimizer available the drawer also shows the study started from the
 * sweep: its headline, its Steps columns, its Constraints and Sensitivity
 * cards and its steps table, in one shape from the first Optimize on.
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
import { WithUserSettings } from "../simulate-view-story-harness";
import {
  FakeExperimentsProvider,
  makeConstrainedSweepExperiment,
  makeExperiment,
  makeParameterSweepExperiment,
  sirSdcpnContextValue,
} from "./experiments-story-fixtures";
import {
  fakeConstrainedStudyInput,
  fakeLongStudyInput,
  fakeLongStudyTrials,
  fakeStudyInput,
  fakeStudyTrials,
  makeConstrainedTrials,
  makeImportance,
  makeOptimizationRecord,
  makeOptimizationsContextValue,
} from "./study-fixtures";
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

/** A study started from `sweep`: the first `steps` fake trials of `input` landed and the best among them. */
const sweepStudy = (
  sweep: ExperimentRecord,
  {
    id,
    status,
    steps,
    startedAgoMs,
    input = fakeStudyInput,
    trials = fakeStudyTrials.trials,
    importance = null,
  }: {
    id: string;
    status: OptimizationRecord["status"];
    steps: number;
    startedAgoMs: number;
    input?: OptimizationRecord["input"];
    trials?: OptimizationRecord["trials"];
    importance?: OptimizationRecord["importance"];
  },
): OptimizationRecord => {
  const landed = trials.slice(0, steps);
  return {
    ...makeOptimizationRecord({
      input,
      status,
      trials: landed,
      best: landed.reduce<OptimizationBest | null>(
        (best, event) => foldBestTrial("maximize", best, event),
        null,
      ),
      importance,
    }),
    id,
    createdAt: Date.now() - startedAgoMs,
    origin: { kind: "sweep", experimentId: sweep.id },
  };
};

/**
 * The sweep drawer with the in-browser optimizer available and `studies`
 * started from the sweep, newest first as the provider keeps them; the
 * first is the one the drawer shows.
 */
const SweepWithStudies = ({
  sweep,
  studies,
}: {
  sweep: ExperimentRecord;
  studies: readonly OptimizationRecord[];
}) => (
  <WithUserSettings overrides={{ enableInBrowserOptimization: true }}>
    <PetrinautOptimizationContext value={storyOptimizer}>
      <SDCPNContext value={sirSdcpnContextValue}>
        <OptimizationsContext
          value={makeOptimizationsContextValue(studies[0]!, {
            optimizations: [...studies],
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

/** The steps the latest study has landed in each state: 4 of 30 while it runs, 17 when Stop ended it. */
const latestStudySteps = { running: 4, complete: 30, cancelled: 17 } as const;

/**
 * The Parameters card offers Optimize, and with a study driving the sweep
 * it turns purple, the header reads Optimizing, its sliders follow the
 * steps, the button reads Stop and the objective strip under the sliders
 * fills in step by step, its axis reaching to the steps asked for. Settled,
 * the strip keeps the whole history and its axis ends at the last step run,
 * complete or stopped; `previous` adds an earlier, stopped study before it,
 * so the strip shows the two end to end with a divider where the second
 * began.
 */
const OptimizableSweep = ({
  latest,
  previous = false,
}: {
  latest: keyof typeof latestStudySteps;
  previous?: boolean;
}) => {
  const sweep = makeParameterSweepExperiment();
  const study = sweepStudy(sweep, {
    id: "sweep-study-2",
    status: latest,
    steps: latestStudySteps[latest],
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
  return <SweepWithStudies sweep={sweep} studies={studies} />;
};

export const Optimizable: Story = {
  name: "Sweep, optimizer available",
  render: () => <OptimizableSweep latest="complete" />,
};

export const Optimizing: Story = {
  name: "Sweep, optimizer driving",
  render: () => <OptimizableSweep latest="running" />,
};

export const StoppedOnce: Story = {
  name: "Sweep, optimization stopped",
  render: () => <OptimizableSweep latest="cancelled" />,
};

export const OptimizedTwice: Story = {
  name: "Sweep, optimized twice",
  render: () => <OptimizableSweep latest="running" previous />,
};

/**
 * The constrained sweep with a constrained study: the Steps clear column,
 * the Constraints card after the metric tile with its verdict line and its
 * bar, the Runs passed column in the steps table and the infeasible draws
 * greyed there and in the strip.
 */
const ConstrainedSweep = ({
  status,
  steps,
}: {
  status: OptimizationRecord["status"];
  steps: number;
}) => {
  const sweep = makeConstrainedSweepExperiment();
  return (
    <SweepWithStudies
      sweep={sweep}
      studies={[
        sweepStudy(sweep, {
          id: "sweep-study-constrained",
          status,
          steps,
          startedAgoMs: 90_000,
          input: fakeConstrainedStudyInput,
          trials: makeConstrainedTrials(fakeConstrainedStudyInput, steps)
            .trials,
        }),
      ]}
    />
  );
};

export const OptimizingWithConstraints: Story = {
  name: "Sweep, optimizing with constraints",
  render: () => <ConstrainedSweep status="running" steps={12} />,
};

export const StoppedWithConstraints: Story = {
  name: "Sweep, optimization with constraints stopped",
  render: () => <ConstrainedSweep status="cancelled" steps={17} />,
};

/**
 * A finished study with its importance estimate landed: above the 50-step
 * floor the Sensitivity card draws a full bar per parameter; below it, at
 * the default 30 steps, the card is muted and the subtitle says to treat
 * the estimate as a hint.
 */
const ImportanceSweep = ({ steps }: { steps: 30 | 60 }) => {
  const sweep = makeParameterSweepExperiment();
  const input = steps === 60 ? fakeLongStudyInput : fakeStudyInput;
  const trials =
    steps === 60 ? fakeLongStudyTrials.trials : fakeStudyTrials.trials;
  return (
    <SweepWithStudies
      sweep={sweep}
      studies={[
        sweepStudy(sweep, {
          id: "sweep-study-importance",
          status: "complete",
          steps,
          startedAgoMs: 600_000,
          input,
          trials,
          importance: makeImportance(input, trials),
        }),
      ]}
    />
  );
};

export const OptimizedWithImportance: Story = {
  name: "Sweep, optimized with importance",
  render: () => <ImportanceSweep steps={60} />,
};

export const OptimizedBelowImportanceFloor: Story = {
  name: "Sweep, optimized below the importance floor",
  render: () => <ImportanceSweep steps={30} />,
};
