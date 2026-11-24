import { SDCPNContext } from "../../../../../react/document/sdcpn-context";
import { LanguageClientProvider } from "../../../../../react/lsp/provider";
import { PetrinautNavigationProvider } from "../../../../../react/navigation/navigation-provider";
import { MonacoProvider } from "../../../../monaco/provider";
import {
  makeExperiment,
  makeProgress,
  sirSdcpnContextValue,
} from "./experiments/experiments-story-fixtures";
import {
  FakeEditorProvider,
  FakeExperimentsProvider,
} from "./experiments/experiments-story-provider";
import { SimulateViewStoryStage } from "./simulate-view-story-harness";

import type { ExperimentRecord } from "../../../../../react/experiments/context";
import type { Meta, StoryObj } from "@storybook/react-vite";

/**
 * The experiment list on records in a state that passes in a moment or needs
 * hardware. The editor has no prop that puts an experiment in a given state,
 * so the Simulate view stands alone here, over fake experiments.
 */
const meta = {
  title: "States/Experiment list",
  parameters: { layout: "fullscreen" },
  render: ({ experiments }) => (
    <PetrinautNavigationProvider initialState={{ mode: "simulate" }}>
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
    </PetrinautNavigationProvider>
  ),
} satisfies Meta<{ experiments: ExperimentRecord[] }>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Initializing: Story = {
  args: {
    experiments: [
      makeExperiment(1, { status: "initializing", progress: null }),
    ],
  },
};

export const LongRunInProgress: Story = {
  name: "Long run in progress",
  args: {
    experiments: [
      makeExperiment(1, {
        status: "running",
        progress: makeProgress({
          activeRuns: 420,
          completedRuns: 580,
          frameNumber: 96,
          time: 96,
        }),
      }),
    ],
  },
};

// Both timestamps are set, so the duration shows what the backend is for:
// milliseconds where the CPU takes seconds.
const gpuRunStartedAt = Date.now() - 30_000;

export const CompleteOnGpu: Story = {
  name: "Complete on GPU",
  args: {
    experiments: [
      makeExperiment(1, {
        name: "SIR Monte Carlo (GPU)",
        status: "complete",
        computeBackend: "webgpu",
        startedAt: gpuRunStartedAt,
        finishedAt: gpuRunStartedAt + 3,
      }),
    ],
  },
};

export const CompleteAfterGpuFallback: Story = {
  name: "Complete after GPU fallback",
  args: {
    experiments: [
      makeExperiment(1, {
        name: "SIR Monte Carlo (fell back)",
        status: "complete",
        computeBackend: "cpu",
        computeBackendFallbackReason:
          'place "Susceptible" holds typed tokens without a declared capacity',
      }),
    ],
  },
};
