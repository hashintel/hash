import { useEffect, useState } from "react";

import { FakeExperimentsProvider } from "../experiments/experiments-story-fixtures";
import {
  NavigatedOptimizationSurface,
  OptimizationSurface,
} from "./optimization-surface";
import {
  makeOptimizationInput,
  makeOptimizationRecord,
  makeSelectionStream,
  makeSyntheticObjectiveSampler,
  makeTrials,
  navigationAtTrial,
  optimizedBindingSets,
  useFakeStudyClock,
} from "./optimizations-story-fixtures";

import type {
  OptimizationNavigation,
  OptimizationRecord,
} from "../../../../../../react/optimizations/context";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Simulate / OptimizationSurface",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const sampleSyntheticObjective = makeSyntheticObjectiveSampler(() => 80);

/** Batches cost real simulation time on the CPU lane, scaling with runs. */
const sampleAtCpuPace = makeSyntheticObjectiveSampler(
  (runCount) => 250 + runCount * 4,
);

/** A GPU lane steps a whole batch in near-constant, negligible time. */
const sampleAtGpuPace = makeSyntheticObjectiveSampler(() => 8);

const OptimizationSurfaceStory = ({
  optimization,
  sampler = sampleSyntheticObjective,
}: {
  optimization: OptimizationRecord;
  sampler?: typeof sampleSyntheticObjective;
}) => (
  <FakeExperimentsProvider
    initialExperiments={[]}
    overrides={{ sampleDetachedObjective: sampler }}
  >
    <div style={{ width: 640 }}>
      <OptimizationSurface optimization={optimization} />
    </div>
  </FakeExperimentsProvider>
);

const baseInput = makeOptimizationInput(optimizedBindingSets.base);

export const NoTrials: Story = {
  name: "No trials yet",
  render: () => (
    <OptimizationSurfaceStory
      optimization={makeOptimizationRecord({ input: baseInput })}
    />
  ),
};

/** Appends one fake trial every 700 ms — rings and best shift live. */
const StreamingTrialsStory = () => {
  const all = makeTrials(baseInput, 30);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setShown((previous) => {
        if (previous >= all.trials.length) {
          clearInterval(timer);
          return previous;
        }
        return previous + 1;
      });
    }, 700);
    return () => clearInterval(timer);
  }, [all.trials.length]);

  const trials = all.trials.slice(0, shown);
  return (
    <OptimizationSurfaceStory
      optimization={makeOptimizationRecord({
        input: baseInput,
        trials,
        best: trials.at(-1)?.best ?? null,
      })}
    />
  );
};

export const StreamingTrials: Story = {
  name: "Streaming trials",
  render: () => <StreamingTrialsStory />,
};

const completeTrials = makeTrials(baseInput, 30);

export const Complete: Story = {
  name: "Complete study",
  render: () => (
    <OptimizationSurfaceStory
      optimization={makeOptimizationRecord({
        input: baseInput,
        trials: completeTrials.trials,
        best: completeTrials.best,
        status: "complete",
      })}
    />
  ),
};

const logScaleInput = makeOptimizationInput(optimizedBindingSets.logScale);
const logScaleTrials = makeTrials(logScaleInput, 20);

export const LogScale: Story = {
  name: "Log-scale parameter",
  render: () => (
    <OptimizationSurfaceStory
      optimization={makeOptimizationRecord({
        input: logScaleInput,
        trials: logScaleTrials.trials,
        best: logScaleTrials.best,
        status: "complete",
      })}
    />
  ),
};

/**
 * The pacing variants: local compute today runs on the CPU's detached lane;
 * the GPU pace previews the planned WebGPU path for point batches. Both use
 * the complete study, so the trial rings sit on the streaming fill.
 */
export const CpuPacedCompute: Story = {
  name: "Local compute at CPU pace",
  render: () => (
    <OptimizationSurfaceStory
      sampler={sampleAtCpuPace}
      optimization={makeOptimizationRecord({
        input: baseInput,
        trials: completeTrials.trials,
        best: completeTrials.best,
        status: "complete",
      })}
    />
  ),
};

export const GpuPacedCompute: Story = {
  name: "Local compute at GPU pace",
  render: () => (
    <OptimizationSurfaceStory
      sampler={sampleAtGpuPace}
      optimization={makeOptimizationRecord({
        input: baseInput,
        trials: completeTrials.trials,
        best: completeTrials.best,
        status: "complete",
      })}
    />
  ),
};

const manyParametersInput = makeOptimizationInput(
  optimizedBindingSets.manyParameters,
);
const manyParametersTrials = makeTrials(manyParametersInput, 24);

export const ManyParameters: Story = {
  name: "Many parameters",
  render: () => (
    <OptimizationSurfaceStory
      optimization={makeOptimizationRecord({
        input: manyParametersInput,
        trials: manyParametersTrials.trials,
        best: manyParametersTrials.best,
        status: "complete",
      })}
    />
  ),
};

/**
 * A connected study's surface computes nothing: its steps are the field's
 * samples — a dot each, the best emphasized, pruned steps hollow — and the
 * field is interpolated between them. The navigation lives in the drawer's
 * navigator, so the plot has no sliders of its own; once the study is over,
 * clicking the plot moves the navigation and the picked point's value enters
 * the field from the selection stream.
 */
const ConnectedSurfaceStory = ({ stepCount }: { stepCount: number }) => {
  const study = makeTrials(baseInput, stepCount);
  const [navigation, setNavigation] = useState<OptimizationNavigation>(() =>
    navigationAtTrial(baseInput, study.trials[study.best?.trial ?? 0]!, false),
  );
  const selection = makeSelectionStream({
    input: baseInput,
    navigation,
    runsCompleted: 100,
  });
  const optimization = makeOptimizationRecord({
    input: baseInput,
    trials: study.trials,
    best: study.best,
    status: "complete",
    navigation,
    selection,
  });

  return (
    <div style={{ width: 640 }}>
      <NavigatedOptimizationSurface
        optimization={optimization}
        navigation={navigation}
        selection={selection}
        onNavigationChange={(patch) =>
          setNavigation((previous) => ({ ...previous, ...patch }))
        }
      />
    </div>
  );
};

export const ConnectedTwoSteps: Story = {
  name: "Connected study, two steps",
  render: () => <ConnectedSurfaceStory stepCount={2} />,
};

export const ConnectedTwelveSteps: Story = {
  name: "Connected study, twelve steps",
  render: () => <ConnectedSurfaceStory stepCount={12} />,
};

/**
 * A connected study mid-run, following its steps: one lands every 1.5 s, and
 * the step in flight streams its running objective into the field at the
 * ringed dot before its own dot lands. The plot only displays until the last
 * step lands, then a click picks a point.
 */
const ConnectedMidRunStory = () => {
  const study = makeTrials(baseInput, 12);
  const { landed, progress } = useFakeStudyClock({
    steps: study.trials.length,
    ticksPerStep: 10,
    tickMs: 150,
  });
  const trials = study.trials.slice(0, landed);
  const inFlight = study.trials[landed];
  const [chosen, setChosen] = useState<OptimizationNavigation>(() =>
    navigationAtTrial(baseInput, study.trials[0]!, true),
  );
  // While following, the navigation is wherever the optimizer is evaluating;
  // once every step has landed it holds at the last one.
  const navigation = chosen.followTrials
    ? navigationAtTrial(baseInput, inFlight ?? study.trials.at(-1)!, true)
    : chosen;
  const selection = inFlight
    ? makeSelectionStream({
        input: baseInput,
        navigation,
        followedTrial: inFlight.trial,
        runsCompleted: 1,
        computing: true,
        progress,
      })
    : makeSelectionStream({ input: baseInput, navigation, runsCompleted: 100 });
  const optimization = makeOptimizationRecord({
    input: baseInput,
    trials,
    best: trials.at(-1)?.best ?? null,
    status: inFlight ? "running" : "complete",
    navigation,
    selection,
  });

  return (
    <div style={{ width: 640 }}>
      <NavigatedOptimizationSurface
        optimization={optimization}
        navigation={navigation}
        selection={selection}
        onNavigationChange={(patch) => setChosen({ ...navigation, ...patch })}
      />
    </div>
  );
};

export const ConnectedMidRun: Story = {
  name: "Connected study mid-run, streaming a step",
  render: () => <ConnectedMidRunStory />,
};
