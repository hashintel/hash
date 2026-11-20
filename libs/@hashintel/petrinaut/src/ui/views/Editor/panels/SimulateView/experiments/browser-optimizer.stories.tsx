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
import type { Meta, StoryObj } from "@storybook/react-vite";

/** One optimizer for the whole Storybook session, as the website keeps one per page. */
const browserOptimization = createBrowserOptimization();

/** A sweep's fixed part; the args supply steps, run count and max time. */
type SweepPreset = Omit<
  AutoSweepStudyDescription,
  "steps" | "runCount" | "maxTime"
>;

const studies = {
  SIR: {
    example: sirModel,
    sweep: {
      scenarioName: "Seasonal Flu",
      name: "Peak infection",
      dt: 0.1,
      sweep: {
        population: { min: 500, max: 5_000 },
        infected_ratio: { min: 0, max: 1 },
      },
      objective: { metricName: "Infected Fraction", direction: "maximize" },
    },
  },
  "Supply Chain": {
    example: supplyChainProfit,
    sweep: {
      scenarioName: "Rich stock",
      name: "Adjusted profit",
      dt: 1,
      sweep: {
        production_rate: { min: 50, max: 400 },
        selling_price: { min: 20, max: 60 },
      },
      objective: { metricName: "Adjusted profit", direction: "maximize" },
    },
  },
  "Vaccination Campaign": {
    example: vaccinationCampaign,
    sweep: {
      scenarioName: "Winter wave",
      name: "Cheapest response",
      dt: 0.1,
      sweep: {
        vaccination_coverage: { min: 0, max: 0.9 },
        contact_reduction: { min: 0, max: 0.8 },
      },
      objective: { metricName: "Total cost", direction: "minimize" },
    },
  },
} satisfies Record<string, { example: StoryExample; sweep: SweepPreset }>;

type BrowserOptimizerArgs = {
  study: keyof typeof studies;
  steps: number;
  runCount: number;
  maxTime: number;
  computeBackend: ExperimentComputeBackend;
  autoStart: boolean;
};

/**
 * The real optimizer, in this tab: Optuna in a worker, each step as seeded
 * runs of the sweep. The first study in a browser downloads the Python
 * runtime and the optimizer packages from jsDelivr and PyPI (about 10 MB);
 * the headline reads Starting with no steps until then.
 */
const meta = {
  title: "States/Optimizer run",
  parameters: { layout: "fullscreen" },
  args: {
    study: "SIR",
    steps: 6,
    runCount: 24,
    maxTime: 60,
    computeBackend: "cpu",
    autoStart: true,
  },
  argTypes: {
    study: { control: "select", options: Object.keys(studies) },
    steps: { control: { type: "range", min: 1, max: 30, step: 1 } },
    runCount: { control: { type: "range", min: 8, max: 200, step: 8 } },
    maxTime: { control: { type: "number", min: 1 } },
    computeBackend: { control: "inline-radio", options: ["cpu", "webgpu"] },
    autoStart: { control: "boolean" },
  },
  render: ({ study, steps, runCount, maxTime, computeBackend, autoStart }) => (
    <RunnableSimulateViewStory
      // A sweep starts once per mount, so a changed control starts over.
      key={`${study}-${steps}-${runCount}-${maxTime}-${computeBackend}-${autoStart}`}
      example={studies[study].example}
      optimization={browserOptimization}
    >
      {autoStart ? (
        <AutoSweepStudy
          study={{ ...studies[study].sweep, steps, runCount, maxTime }}
          computeBackend={computeBackend}
        />
      ) : null}
    </RunnableSimulateViewStory>
  ),
} satisfies Meta<BrowserOptimizerArgs>;

export default meta;

type Story = StoryObj<BrowserOptimizerArgs>;

/** Seasonal Flu swept over population and infected ratio, maximizing Infected Fraction. */
export const SirCpu: Story = { name: "SIR CPU" };

/**
 * The GPU requested for the runs. With WebGPU the steps run on the device and
 * the drawer's Compute badge reads GPU; without it the backend declines, and
 * the badge reads CPU with the reason in its tooltip.
 */
export const SirGpuRequested: Story = {
  name: "SIR GPU requested",
  args: { computeBackend: "webgpu" },
};

/** Rich stock swept over production rate and selling price, maximizing Adjusted profit. */
export const SupplyChain: Story = { args: { study: "Supply Chain" } };

/**
 * Winter wave swept over vaccination coverage and contact reduction,
 * minimizing Total cost: the Surface shows a valley with its floor near a
 * coverage of 0.45 and a contact reduction of 0.4.
 */
export const VaccinationCampaign: Story = {
  args: { study: "Vaccination Campaign" },
};

/** No experiment yet: the entry point for creating one by hand against the real optimizer. */
export const Manual: Story = { args: { autoStart: false } };
