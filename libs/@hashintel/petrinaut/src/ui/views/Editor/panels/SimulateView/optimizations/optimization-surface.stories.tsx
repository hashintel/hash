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
 * used, returned as a single-bin distribution frame after a short delay — so
 * the contour fills in progressively and the trial rings land on it.
 */
const sampleSyntheticObjective = (request: DetachedObjectiveRequest) => {
  const objective = syntheticObjective(request.scenarioParameterValues);
  const frame = {
    metricId: request.metric.id,
    label: request.metric.label,
    outputType: "distribution" as const,
    frameNumber: 365,
    time: 365,
    bins: [[Math.round(objective * 100) / 100, request.runCount]] as (readonly [
      number,
      number,
    ])[],
    value: null,
    frameValue: null,
    timeValue: null,
    runSampleCount: request.runCount,
    timeSampleCount: request.runCount,
  };
  return new Promise<{ runsCompleted: number; metricFrames: [typeof frame] }>(
    (resolve) => {
      setTimeout(
        () =>
          resolve({ runsCompleted: request.runCount, metricFrames: [frame] }),
        80,
      );
    },
  );
};

const OptimizationSurfaceStory = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) => (
  <FakeExperimentsProvider
    initialExperiments={[]}
    overrides={{ sampleDetachedObjective: sampleSyntheticObjective }}
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
