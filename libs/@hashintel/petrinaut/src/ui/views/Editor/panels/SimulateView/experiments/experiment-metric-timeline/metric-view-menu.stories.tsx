import { useState } from "react";
import { userEvent, within } from "storybook/test";

import { ChartCard } from "../../shared/chart-card";
import { ExperimentMetricTimeline } from "../experiment-metric-timeline";
import { sirInfectedFrame } from "../experiments-story-fixtures";
import { describeMetricView } from "./describe-metric-view";
import { MetricViewMenu } from "./metric-view-menu";
import {
  DEFAULT_METRIC_VIEW_SETTINGS,
  type MetricViewSettings,
} from "./view-state";

import type { MetricFrame } from "./shared/metric-frames";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Simulate / MetricViewMenu",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const FRAME_COUNT = 46;
const PLOT_HEIGHT = 220;

const distributionFrames: MetricFrame[] = Array.from(
  { length: FRAME_COUNT },
  (_, frameNumber) =>
    sirInfectedFrame({
      frameNumber,
      transmissionRate: 0.3,
      recoveryDays: 8,
      spread: 9,
      runs: 25,
    }),
);

/** A metric card owning its view settings, the way `MetricTiles` does. */
const MetricCard = ({
  title,
  outputType,
  frames,
  initialSettings = DEFAULT_METRIC_VIEW_SETTINGS,
}: {
  title: string;
  outputType: MetricFrame["outputType"];
  frames: readonly MetricFrame[];
  initialSettings?: MetricViewSettings;
}) => {
  const [settings, setSettings] = useState(initialSettings);
  return (
    <div style={{ width: 480, paddingBottom: 160 }}>
      <ChartCard
        title={title}
        subtitle={describeMetricView(settings, outputType)}
        actions={
          <MetricViewMenu
            outputType={outputType}
            value={settings}
            onChange={setSettings}
          />
        }
        bodyHeight={PLOT_HEIGHT}
      >
        <ExperimentMetricTimeline
          frames={frames}
          settings={settings}
          expectedOutputType={outputType}
          timeDomain={[0, FRAME_COUNT - 1]}
          plotHeight={PLOT_HEIGHT}
        />
      </ChartCard>
    </div>
  );
};

const openMenu: Story["play"] = async ({ canvasElement }) => {
  await userEvent.click(
    within(canvasElement).getByRole("button", { name: "Chart options" }),
  );
};

/**
 * A distribution metric's options: the Runs block, here aggregated to the
 * median, above the Time block drawing every step. Flip a block's switch and
 * its list follows; the chart behind re-draws while the popover stays open.
 */
export const DistributionMetric: Story = {
  render: () => (
    <MetricCard
      title="Infected"
      outputType="distribution"
      frames={distributionFrames}
      initialSettings={{
        ...DEFAULT_METRIC_VIEW_SETTINGS,
        aggregateRuns: true,
        runAggregation: "median",
      }}
    />
  ),
  play: openMenu,
};

/** A scalar metric has no runs to collapse, so its options are the Time block alone. */
export const ScalarMetric: Story = {
  render: () => (
    <MetricCard title="Peak infected" outputType="scalar" frames={[]} />
  ),
  play: openMenu,
};
