import { useEffect, useState } from "react";

import { FakeExperimentsProvider } from "../experiments/experiments-story-fixtures";
import { OptimizationSurface } from "./optimization-surface";
import {
  makeOptimizationInput,
  makeOptimizationRecord,
  makeTrials,
  optimizedBindingSets,
  syntheticObjective,
} from "./optimizations-story-fixtures";

import type { DetachedObjectiveRequest } from "../../../../../../react/experiments/context";
import type { OptimizationRecord } from "../../../../../../react/optimizations/context";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Simulate / OptimizationSurface",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The stories' local compute: the same synthetic objective the fake trials
 * used, returned as a single-bin distribution frame after `delayFor` the
 * batch — so the contour fills in progressively and the trial rings land on
 * it, at whatever pace the story simulates.
 */
const makeSyntheticObjectiveSampler =
  (delayFor: (runCount: number) => number) =>
  (request: DetachedObjectiveRequest) => {
    const objective = syntheticObjective(request.scenarioParameterValues);
    const frame = {
      metricId: request.metric.id,
      label: request.metric.label,
      outputType: "distribution" as const,
      frameNumber: 365,
      time: 365,
      bins: [
        [Math.round(objective * 100) / 100, request.runCount],
      ] as (readonly [number, number])[],
      value: null,
      frameValue: null,
      timeValue: null,
      runSampleCount: request.runCount,
      timeSampleCount: request.runCount,
    };
    return new Promise<{
      runsCompleted: number;
      metricFrames: [typeof frame];
    }>((resolve) => {
      setTimeout(
        () =>
          resolve({ runsCompleted: request.runCount, metricFrames: [frame] }),
        delayFor(request.runCount),
      );
    });
  };

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
