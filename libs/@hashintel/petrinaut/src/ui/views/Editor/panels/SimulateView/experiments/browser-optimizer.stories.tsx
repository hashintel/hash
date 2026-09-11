import { createBrowserOptimization } from "@hashintel/petrinaut-core/browser-optimization";
import {
  sirModel,
  supplyChainProfit,
  vaccinationCampaign,
} from "@hashintel/petrinaut-core/examples";

import {
  AutoSweepStudy,
  type AutoSweepStudyDescription,
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
  runCount: number;
  maxTime: number;
  computeBackend: ExperimentComputeBackend;
  autoStart: boolean;
};

const meta = {
  title: "Simulate / Browser optimizer (real)",
  parameters: { layout: "fullscreen" },
  args: {
    steps: 6,
    runCount: 24,
    maxTime: 60,
    computeBackend: "cpu",
    autoStart: true,
  },
  argTypes: {
    steps: { control: { type: "range", min: 1, max: 30, step: 1 } },
    runCount: { control: { type: "range", min: 8, max: 200, step: 8 } },
    maxTime: { control: { type: "number", min: 1 } },
    computeBackend: { control: "inline-radio", options: ["cpu", "webgpu"] },
    autoStart: { control: "boolean" },
  },
} satisfies Meta<BrowserOptimizerArgs>;

export default meta;

type Story = StoryObj<BrowserOptimizerArgs>;

/** A sweep's fixed part; the args supply steps, run count and max time. */
type SweepPreset = Omit<
  AutoSweepStudyDescription,
  "steps" | "runCount" | "maxTime"
>;

const seasonalFluSweep: SweepPreset = {
  scenarioName: "Seasonal Flu",
  name: "Peak infection",
  dt: 0.1,
  sweep: {
    population: { min: 500, max: 5_000 },
    infected_ratio: { min: 0, max: 1 },
  },
  objective: { metricName: "Infected Fraction", direction: "maximize" },
};

const richStockSweep: SweepPreset = {
  scenarioName: "Rich stock",
  name: "Adjusted profit",
  dt: 1,
  sweep: {
    production_rate: { min: 50, max: 400 },
    selling_price: { min: 20, max: 60 },
  },
  objective: { metricName: "Adjusted profit", direction: "maximize" },
};

const winterWaveSweep: SweepPreset = {
  scenarioName: "Winter wave",
  name: "Cheapest response",
  dt: 0.1,
  sweep: {
    vaccination_coverage: { min: 0, max: 0.9 },
    contact_reduction: { min: 0, max: 0.8 },
  },
  objective: { metricName: "Total cost", direction: "minimize" },
};

const BrowserOptimizerStory = ({
  example,
  sweep,
  settings,
  steps,
  runCount,
  maxTime,
  computeBackend,
  autoStart,
}: BrowserOptimizerArgs & {
  example: StoryExample;
  sweep: SweepPreset;
  settings?: Partial<UserSettings>;
}) => (
  <RunnableSimulateViewStory
    // A sweep starts once per mount, so a changed control starts over.
    key={`${steps}-${runCount}-${maxTime}-${computeBackend}-${autoStart}`}
    example={example}
    optimization={browserOptimization}
    settings={settings}
  >
    {autoStart ? (
      <AutoSweepStudy
        study={{ ...sweep, steps, runCount, maxTime }}
        computeBackend={computeBackend}
      />
    ) : null}
  </RunnableSimulateViewStory>
);

const firstRunNote =
  "The first study in a browser downloads the Python runtime and the optimizer packages from jsDelivr and PyPI (about 10 MB, a few seconds); the headline reads Starting with no steps until then, and later studies reuse the browser's cache. The whole study runs in this tab: Optuna in a worker, each step as seeded runs of the sweep on the experiments backend.";

const watchForNote =
  "The sweep is created and its drawer opens; the study starts from the Parameters card as Optimize would, and Stop takes its place while it drives. Watch the sliders follow each step, the Objective by step strip under them gain a dot per step, the Surface fill in between the visited points, the headline count the steps with its convergence chip, the Steps column tick, and the steps table fill newest first with the best step starred. Once the study settles the sliders unlock parked on the best point, Optimize returns, and the Sensitivity card keeps its estimate.";

const gpuNote =
  "With WebGPU on in settings, the create form's Backend switch appears, available when the metric translates to WGSL (counts, parameters, arithmetic, conditionals and one place's tokens) and greyed out with the reason on hover otherwise; a drafted state constraint greys it out too, since its indicator aggregates over time.";

export const SirCpu: Story = {
  name: "SIR CPU",
  parameters: {
    docs: {
      description: {
        story: `The SIR model's Seasonal Flu scenario swept over population and infected ratio, maximizing Infected Fraction on the CPU. ${firstRunNote} ${watchForNote} ${gpuNote}`,
      },
    },
  },
  render: (args) => (
    <BrowserOptimizerStory
      {...args}
      example={sirModel}
      sweep={seasonalFluSweep}
    />
  ),
};

export const SirGpuRequested: Story = {
  name: "SIR GPU requested",
  args: { computeBackend: "webgpu" },
  parameters: {
    docs: {
      description: {
        story: `The SIR sweep with WebGPU enabled and the GPU requested for its runs. Infected Fraction translates to WGSL, so in a browser with WebGPU the steps run on the device and the drawer's Compute badge reads GPU; without WebGPU the backend declines the request and the badge reads CPU with the reason in its tooltip: the real fallback. ${firstRunNote} ${watchForNote} ${gpuNote}`,
      },
    },
  },
  render: (args) => (
    <BrowserOptimizerStory
      {...args}
      example={sirModel}
      sweep={seasonalFluSweep}
      settings={{ webGpuEnabled: true }}
    />
  ),
};

export const SupplyChain: Story = {
  name: "Supply Chain",
  parameters: {
    docs: {
      description: {
        story: `The supply chain example's Rich stock scenario swept over production rate and selling price, maximizing Adjusted profit on the CPU; two numeric parameters, so the Surface shows. ${firstRunNote} ${watchForNote} ${gpuNote}`,
      },
    },
  },
  render: (args) => (
    <BrowserOptimizerStory
      {...args}
      example={supplyChainProfit}
      sweep={richStockSweep}
    />
  ),
};

export const VaccinationCampaign: Story = {
  name: "Vaccination Campaign",
  parameters: {
    docs: {
      description: {
        story: `The Vaccination Campaign example's Winter wave scenario swept over vaccination coverage (0 to 0.9) and contact reduction (0 to 0.8), minimizing Total cost on the CPU. Cases are priced against a campaign and distancing whose prices rise quadratically, so the Surface shows a valley along the epidemic threshold with its floor near a coverage of 0.45 and a contact reduction of 0.4 (about 960 against 1,280 to 2,220 in the corners). Six steps are still the sampler's random start-up, so expect scattered dots with the best step landing in the valley. The net is GPU-eligible and Total cost translates to WGSL, so with WebGPU on the sweep can run on the device. ${firstRunNote} ${watchForNote} ${gpuNote}`,
      },
    },
  },
  render: (args) => (
    <BrowserOptimizerStory
      {...args}
      example={vaccinationCampaign}
      sweep={winterWaveSweep}
    />
  ),
};

export const Manual: Story = {
  args: { autoStart: false },
  parameters: {
    docs: {
      description: {
        story: `The real optimizer with the In-browser optimization and Parameter sweeps settings on and the Experiments tab open, and no experiment: the entry point for hand-testing the Create Experiment drawer's Sweep toggles and Constraints section, then Optimize on the sweep's Parameters card. ${firstRunNote} ${watchForNote} ${gpuNote}`,
      },
    },
  },
  render: (args) => (
    <BrowserOptimizerStory
      {...args}
      example={sirModel}
      sweep={seasonalFluSweep}
      settings={{ webGpuEnabled: true }}
    />
  ),
};
