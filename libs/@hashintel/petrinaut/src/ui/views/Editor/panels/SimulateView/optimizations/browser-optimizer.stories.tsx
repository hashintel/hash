import { createBrowserOptimization } from "@hashintel/petrinaut-core/browser-optimization";
import {
  sirModel,
  supplyChainProfit,
} from "@hashintel/petrinaut-core/examples";

import {
  AutoStudy,
  type AutoStudyDescription,
  RunnableSimulateViewStory,
  type StoryExample,
} from "../simulate-view-story-harness";

import type { ExperimentComputeBackend } from "../../../../../../react/experiments/context";
import type { UserSettings } from "../../../../../../react/state/user-settings-context";
import type { Meta, StoryObj } from "@storybook/react-vite";

/** One optimizer for the whole Storybook session, as the website keeps one per page. */
const browserOptimization = createBrowserOptimization();

type BrowserOptimizerArgs = {
  steps: number;
  runsPerStep: number;
  maxTime: number;
  computeBackend: ExperimentComputeBackend;
  autoStart: boolean;
};

const meta = {
  title: "Simulate / Browser optimizer (real)",
  parameters: { layout: "fullscreen" },
  args: {
    steps: 4,
    runsPerStep: 3,
    maxTime: 60,
    computeBackend: "cpu",
    autoStart: true,
  },
  argTypes: {
    steps: { control: { type: "range", min: 1, max: 20, step: 1 } },
    runsPerStep: { control: { type: "range", min: 1, max: 10, step: 1 } },
    maxTime: { control: { type: "number", min: 1 } },
    computeBackend: { control: "inline-radio", options: ["cpu", "webgpu"] },
    autoStart: { control: "boolean" },
  },
} satisfies Meta<BrowserOptimizerArgs>;

export default meta;

type Story = StoryObj<BrowserOptimizerArgs>;

/** A study's fixed part; the args supply steps, runs per step and max time. */
type StudyPreset = Omit<
  AutoStudyDescription,
  "steps" | "runsPerStep" | "maxTime"
>;

const seasonalFluStudy: StudyPreset = {
  scenarioName: "Seasonal Flu",
  name: "Peak infection",
  dt: 0.1,
  optimize: {
    population: { minimum: 500, maximum: 5_000 },
    infected_ratio: { minimum: 0, maximum: 1 },
  },
  objective: { metricName: "Infected Fraction", direction: "maximize" },
};

const richStockStudy: StudyPreset = {
  scenarioName: "Rich stock",
  name: "Adjusted profit",
  dt: 1,
  optimize: {
    production_rate: { minimum: 50, maximum: 400 },
    selling_price: { minimum: 20, maximum: 60 },
  },
  objective: { metricName: "Adjusted profit", direction: "maximize" },
};

const BrowserOptimizerStory = ({
  example,
  study,
  settings,
  steps,
  runsPerStep,
  maxTime,
  computeBackend,
  autoStart,
}: BrowserOptimizerArgs & {
  example: StoryExample;
  study: StudyPreset;
  settings?: Partial<UserSettings>;
}) => (
  <RunnableSimulateViewStory
    // A study starts once per mount, so a changed control starts over.
    key={`${steps}-${runsPerStep}-${maxTime}-${computeBackend}-${autoStart}`}
    example={example}
    initialSimulateViewMode="optimizations"
    optimization={browserOptimization}
    settings={settings}
  >
    {autoStart ? (
      <AutoStudy
        study={{ ...study, steps, runsPerStep, maxTime }}
        computeBackend={computeBackend}
      />
    ) : null}
  </RunnableSimulateViewStory>
);

const firstRunNote =
  "The first study in a browser downloads the Python runtime and the optimizer packages from jsDelivr and PyPI (about 10 MB, a few seconds); the record shows Running with no steps until then, and later studies reuse the browser's cache. The whole study runs in this tab: Optuna in a worker, each step as seeded simulations on the experiments backend.";

const watchForNote =
  "Watch the Parameters band follow each step, the Surface gain a dot per step — the best emphasized, the field filling in between them, the ringed dot on the step in flight streaming its running value — and the Metrics tile stream the objective over the step's runs. While the study runs the sliders are disabled and a drag on the Surface does nothing; turn Follow steps off to take over early. Once complete, click the Surface or move a slider: the point refines in escalating batches, its value enters the field, and the Metrics tile streams again.";

const gpuNote =
  "With WebGPU on in settings, the create form's Backend switch appears but stays disabled for an expression objective by design: the GPU backend cannot compute expression metrics, so steps run on the CPU.";

export const SirCpu: Story = {
  name: "SIR CPU",
  parameters: {
    docs: {
      description: {
        story: `The SIR model's Seasonal Flu scenario, maximizing Infected Fraction over population and infected ratio on the CPU. ${firstRunNote} ${watchForNote} ${gpuNote}`,
      },
    },
  },
  render: (args) => (
    <BrowserOptimizerStory
      {...args}
      example={sirModel}
      study={seasonalFluStudy}
    />
  ),
};

export const SirGpuRequested: Story = {
  name: "SIR GPU requested",
  args: { computeBackend: "webgpu" },
  parameters: {
    docs: {
      description: {
        story: `The SIR study with WebGPU enabled and the GPU requested for its steps. The GPU backend declines the expression objective, so the record's badge reads CPU and its tooltip carries the reason: the real fallback. ${firstRunNote} ${watchForNote} ${gpuNote}`,
      },
    },
  },
  render: (args) => (
    <BrowserOptimizerStory
      {...args}
      example={sirModel}
      study={seasonalFluStudy}
      settings={{ webGpuEnabled: true }}
    />
  ),
};

export const SupplyChain: Story = {
  name: "Supply Chain",
  parameters: {
    docs: {
      description: {
        story: `The supply chain example's Rich stock scenario, maximizing Adjusted profit over production rate and selling price on the CPU; two numeric parameters, so the Surface shows. ${firstRunNote} ${watchForNote} ${gpuNote}`,
      },
    },
  },
  render: (args) => (
    <BrowserOptimizerStory
      {...args}
      example={supplyChainProfit}
      study={richStockStudy}
    />
  ),
};

export const Manual: Story = {
  args: { autoStart: false },
  parameters: {
    docs: {
      description: {
        story: `The real optimizer with the In-browser optimization setting on and the Optimizations tab open, and no study: the entry point for hand-testing the create form. ${firstRunNote} ${watchForNote} ${gpuNote}`,
      },
    },
  },
  render: (args) => (
    <BrowserOptimizerStory
      {...args}
      example={sirModel}
      study={seasonalFluStudy}
      settings={{ webGpuEnabled: true }}
    />
  ),
};
