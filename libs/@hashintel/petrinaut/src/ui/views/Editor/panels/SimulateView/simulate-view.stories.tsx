import {
  type AbortSignalLike,
  type PetrinautOptimization,
  type PetrinautOptimizationEvent,
  type PetrinautOptimizationInput,
  type PetrinautOptimizationParameterBinding,
} from "@hashintel/petrinaut-core";
import {
  probabilisticSatellitesSDCPN,
  sirModel,
  supplyChainProfit,
} from "@hashintel/petrinaut-core/examples";
import {
  deriveOptimizationTrialSeeds,
  type OptimizationScalar,
  type PetrinautConnectedOptimization,
  type PetrinautOptimizationChannel,
  resolveTrialScenarioParameterValues,
} from "@hashintel/petrinaut-core/optimization";

import { LanguageClientProvider } from "../../../../../react/lsp/provider";
import { SDCPNContext } from "../../../../../react/state/sdcpn-context";
import { MonacoProvider } from "../../../../monaco/provider";
import {
  FakeEditorProvider,
  FakeExperimentsProvider,
  makeExperiment,
  makeParameterSweepExperiment,
  makeProgress,
  multipleExperiments,
  oneExperiment,
  sirSdcpnContextValue,
} from "./experiments/experiments-story-fixtures";
import { SimulateView } from "./simulate-view";
import {
  RunnableSimulateViewStory,
  SimulateViewStoryStage,
} from "./simulate-view-story-harness";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Simulate / SimulateView",
  component: SimulateView,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SimulateView>;

export default meta;

type Story = StoryObj<typeof meta>;

const wait = (durationMs: number, signal?: AbortSignalLike) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    let timeout: number | undefined;
    const handleAbort = () => {
      if (timeout !== undefined) {
        window.clearTimeout(timeout);
      }
      resolve();
    };
    timeout = window.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, durationMs);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });

const sampleBinding = (
  binding: Extract<PetrinautOptimizationParameterBinding, { kind: "optimize" }>,
  trial: number,
  requestedTrials: number,
): number | boolean => {
  const fraction = requestedTrials <= 1 ? 0.5 : trial / (requestedTrials - 1);

  switch (binding.domain.kind) {
    case "continuous":
      if (binding.domain.scale === "log") {
        const lower = Math.log(binding.domain.minimum);
        const upper = Math.log(binding.domain.maximum);
        return Math.exp(lower + (upper - lower) * fraction);
      }
      return (
        binding.domain.minimum +
        (binding.domain.maximum - binding.domain.minimum) * fraction
      );
    case "integer": {
      const slots =
        Math.floor(
          (binding.domain.maximum - binding.domain.minimum) /
            binding.domain.step,
        ) + 1;
      return (
        binding.domain.minimum +
        (trial % Math.max(1, slots)) * binding.domain.step
      );
    }
    case "boolean":
      return trial % 2 === 0;
  }
};

type FakeTrialState = Extract<
  PetrinautOptimizationEvent,
  { type: "trial" }
>["state"];

const getFakeTrialState = (trial: number, seed: number): FakeTrialState => {
  // A deterministic weighted roll keeps stories reproducible while producing
  // approximately 82% complete, 12% pruned, and 6% failed steps.
  const roll = (((trial * 73 + seed) % 100) + 100) % 100;
  return roll < 82 ? "complete" : roll < 94 ? "pruned" : "failed";
};

type FakeTrialEvaluation = { objective: number | null; state: FakeTrialState };

/** How the fake optimizer obtains one trial's outcome. */
type FakeTrialEvaluator = (trial: {
  runId: string;
  input: PetrinautOptimizationInput;
  trial: number;
  parameters: Record<string, OptimizationScalar>;
  signal: AbortSignalLike | undefined;
}) => Promise<FakeTrialEvaluation>;

/** Synthetic objectives after a short delay: no simulation runs. */
const syntheticTrialEvaluator: FakeTrialEvaluator = async ({
  input,
  trial,
  signal,
}) => {
  await wait(250, signal);
  const state = getFakeTrialState(trial, input.execution.seed);
  const requestedTrials = input.study.trials;
  const objective =
    input.objective.direction === "maximize"
      ? trial + 1 / (trial + 1)
      : requestedTrials - trial + 1 / (trial + 1);
  return { objective: state === "complete" ? objective : null, state };
};

/** Trials evaluated by the host's experiments backend through the channel. */
const channelTrialEvaluator =
  (channel: PetrinautOptimizationChannel): FakeTrialEvaluator =>
  async ({ runId, input, trial, parameters, signal }) => {
    const abortController = new AbortController();
    signal?.addEventListener("abort", () => abortController.abort(), {
      once: true,
    });
    const outcome = await channel.evaluateTrial({
      runId,
      trial,
      manifest: input,
      suggestedValues: parameters,
      scenarioParameterValues: resolveTrialScenarioParameterValues(
        input,
        parameters,
      ),
      seeds: deriveOptimizationTrialSeeds(
        input.execution.seed,
        input.execution.seedsPerTrial ?? 1,
      ),
      signal: abortController.signal,
    });
    return outcome.kind === "objective"
      ? { objective: outcome.objective, state: "complete" }
      : { objective: null, state: "pruned" };
  };

/** Inputs of the fake detached runs created in this story session. */
const fakeRuns = new Map<string, PetrinautOptimizationInput>();
let nextFakeRunId = 1;

const createFakeOptimization = (
  evaluate: FakeTrialEvaluator,
): PetrinautOptimization => ({
  createOptimizationRun: (input) => {
    const runId = `story-run-${nextFakeRunId++}`;
    fakeRuns.set(runId, input);
    return Promise.resolve({ runId });
  },
  cancelOptimizationRun: (runId) => {
    fakeRuns.delete(runId);
    return Promise.resolve();
  },
  async *attachOptimizationRun(runId, options) {
    const input = fakeRuns.get(runId);
    if (!input) {
      // Shaped like a classified transport 404 so the provider silently
      // drops records restored from a previous story session.
      throw Object.assign(new Error(`Unknown story run ${runId}`), {
        category: "http",
        httpStatus: 404,
      });
    }
    options?.onAttached?.();

    let seq = 0;
    const requestedTrials = input.study.trials;
    let completedTrials = 0;
    let prunedTrials = 0;
    let failedTrials = 0;
    let best: NonNullable<
      Extract<PetrinautOptimizationEvent, { type: "complete" }>["best"]
    > | null = null;

    const cursor = options?.cursor ?? 0;

    seq += 1;
    if (seq > cursor) {
      yield { type: "started", requestedTrials, seq };
    }

    for (let trial = 0; trial < requestedTrials; trial += 1) {
      const parameters = Object.fromEntries(
        Object.entries(input.scenario.parameterBindings).flatMap(
          ([identifier, binding]) =>
            binding.kind === "optimize"
              ? [
                  [
                    identifier,
                    sampleBinding(binding, trial, requestedTrials),
                  ] as const,
                ]
              : [],
        ),
      );
      const { objective, state } = await evaluate({
        runId,
        input,
        trial,
        parameters,
        signal: options?.signal,
      });
      if (options?.signal?.aborted) {
        return;
      }

      if (objective !== null) {
        completedTrials += 1;
        const isBetter =
          best === null ||
          (input.objective.direction === "maximize"
            ? objective > best.objective
            : objective < best.objective);
        if (isBetter) {
          best = { trial, parameters, objective };
        }
      } else if (state === "pruned") {
        prunedTrials += 1;
      } else {
        failedTrials += 1;
      }

      seq += 1;
      if (seq > cursor) {
        yield {
          type: "trial",
          trial,
          parameters,
          objective,
          state,
          best,
          seq,
        };
      }
    }

    seq += 1;
    yield {
      type: "complete",
      requestedTrials,
      completedTrials,
      prunedTrials,
      failedTrials,
      best,
      seq,
    };
  },
});

const fakeOptimization = createFakeOptimization(syntheticTrialEvaluator);

/**
 * A connected source: the fake optimizer suggests parameters while the
 * host's experiments backend simulates every trial through the channel, so
 * the study drawer follows each step's metrics as it is evaluated.
 */
const fakeConnectedOptimization: PetrinautConnectedOptimization = {
  kind: "connected",
  connect: (channel) => ({
    ...createFakeOptimization(channelTrialEvaluator(channel)),
    // The synthetic study keeps no sampler to continue.
    extendOptimizationRun: () =>
      Promise.reject(new Error("The synthetic optimizer cannot be continued")),
    releaseOptimizationRun: (runId) => {
      fakeRuns.delete(runId);
      return Promise.resolve();
    },
    dispose: () => {},
  }),
};

const SimulateViewStory = ({
  experiments,
}: {
  experiments: Parameters<
    typeof FakeExperimentsProvider
  >[0]["initialExperiments"];
}) => (
  <SDCPNContext value={sirSdcpnContextValue}>
    <LanguageClientProvider>
      <MonacoProvider>
        <FakeEditorProvider>
          <FakeExperimentsProvider initialExperiments={experiments}>
            <SimulateViewStoryStage />
          </FakeExperimentsProvider>
        </FakeEditorProvider>
      </MonacoProvider>
    </LanguageClientProvider>
  </SDCPNContext>
);

export const None: Story = {
  render: () => <SimulateViewStory experiments={[]} />,
};

export const One: Story = {
  render: () => <SimulateViewStory experiments={[oneExperiment]} />,
};

export const Multiple: Story = {
  render: () => <SimulateViewStory experiments={multipleExperiments} />,
};

export const Initializing: Story = {
  render: () => (
    <SimulateViewStory
      experiments={[
        makeExperiment(1, { status: "initializing", progress: null }),
      ]}
    />
  ),
};

export const InProgress: Story = {
  name: "In progress",
  render: () => (
    <SimulateViewStory
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

export const ParameterSweep: Story = {
  name: "Parameter sweep",
  render: () => (
    <SimulateViewStory experiments={[makeParameterSweepExperiment()]} />
  ),
};

export const Complete: Story = {
  render: () => (
    <SimulateViewStory
      experiments={[makeExperiment(1, { status: "complete" })]}
    />
  ),
};

export const CompleteOnGpu: Story = {
  name: "Complete on GPU",
  render: () => {
    // The point of the backend: milliseconds where the CPU takes seconds. Both
    // timestamps are set here so the duration does not depend on how the fixture
    // derives them.
    const startedAt = Date.now() - 30_000;

    return (
      <SimulateViewStory
        experiments={[
          makeExperiment(1, {
            name: "SIR Monte Carlo (GPU)",
            status: "complete",
            computeBackend: "webgpu",
            startedAt,
            finishedAt: startedAt + 3,
          }),
        ]}
      />
    );
  },
};

export const CompleteAfterGpuFallback: Story = {
  name: "Complete after GPU fallback",
  render: () => (
    <SimulateViewStory
      experiments={[
        makeExperiment(1, {
          name: "SIR Monte Carlo (fell back)",
          status: "complete",
          computeBackend: "cpu",
          computeBackendFallbackReason:
            'place "Susceptible" holds typed tokens without a declared capacity',
        }),
      ]}
    />
  ),
};

export const RunSIRExperiment: Story = {
  name: "Run SIR experiment",
  render: () => <RunnableSimulateViewStory example={sirModel} />,
};

export const RunSatellitesLauncherExperiment: Story = {
  name: "Run Satellites Launcher experiment",
  render: () => (
    <RunnableSimulateViewStory example={probabilisticSatellitesSDCPN} />
  ),
};

export const RunSupplyChainOptimization: Story = {
  name: "Run Supply Chain optimization",
  render: () => (
    <RunnableSimulateViewStory
      example={supplyChainProfit}
      initialSimulateViewMode="optimizations"
      optimization={fakeOptimization}
    />
  ),
};

export const RunSupplyChainOptimizationSyntheticOptimizer: Story = {
  name: "Run Supply Chain optimization (synthetic optimizer)",
  parameters: {
    docs: {
      description: {
        story:
          "A synthetic sampler suggests each step's parameters through the real connected channel, and the real experiments backend simulates them, so the drawer follows the steps as it would with the real optimizer. Fast, deterministic, no download. For the real Pyodide/Optuna optimizer see Simulate / Browser optimizer (real).",
      },
    },
  },
  render: () => (
    <RunnableSimulateViewStory
      example={supplyChainProfit}
      initialSimulateViewMode="optimizations"
      optimization={fakeConnectedOptimization}
    />
  ),
};
