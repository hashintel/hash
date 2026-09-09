import { useState } from "react";

import { Chip } from "@hashintel/ds-components";

import {
  DEFAULT_METRIC_VIEW_SETTINGS,
  describeMetricView,
  ExperimentMetricTimeline,
  MetricViewMenu,
  type MetricViewSettings,
} from "../experiments/experiment-metric-timeline";
import { sirInfectedFrame } from "../experiments/experiments-story-fixtures";
import {
  ChartCard,
  ChartCardGrid,
  chartCardHeight,
  ChartCardMenu,
} from "./chart-card";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Simulate / ChartCard",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

type MetricFrame = ExperimentRecord["metricFrames"][number];

const FRAME_COUNT = 46;
const PLOT_HEIGHT = 220;

const frames: MetricFrame[] = Array.from(
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

const noop = () => undefined;

const placeholderMenu = (
  <ChartCardMenu
    label="Chart options"
    items={[
      { text: "Expand", onClick: noop },
      { text: "Download", onClick: noop },
    ]}
  />
);

const MetricCard = ({
  title,
  initialSettings = DEFAULT_METRIC_VIEW_SETTINGS,
  frames: cardFrames = frames,
}: {
  title: string;
  initialSettings?: MetricViewSettings;
  frames?: readonly MetricFrame[];
}) => {
  const [settings, setSettings] = useState(initialSettings);
  return (
    <ChartCard
      title={title}
      subtitle={describeMetricView(settings, "distribution")}
      actions={
        <MetricViewMenu
          outputType="distribution"
          value={settings}
          onChange={setSettings}
        />
      }
      bodyHeight={PLOT_HEIGHT}
    >
      <ExperimentMetricTimeline
        frames={cardFrames}
        settings={settings}
        expectedOutputType="distribution"
        timeDomain={[0, FRAME_COUNT - 1]}
        plotHeight={PLOT_HEIGHT}
      />
    </ChartCard>
  );
};

export const Default: Story = {
  render: () => (
    <div style={{ width: 480 }}>
      <MetricCard title="Infected" />
    </div>
  ),
};

/**
 * Six cards of differing content in one fixed grid: a heatmap, percentile
 * lines, a median line, an aggregate number, an empty shell, and a plain
 * card with a footer. Every card is the same height; change any card's view
 * from its menu and nothing around it moves.
 */
export const Grid: Story = {
  render: () => (
    <div
      style={{ width: 900, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <ChartCardGrid
        minColumnWidth={360}
        rowHeight={chartCardHeight({ bodyHeight: PLOT_HEIGHT })}
      >
        <MetricCard title="Heatmap" />
        <MetricCard
          title="Percentile lines"
          initialSettings={{
            ...DEFAULT_METRIC_VIEW_SETTINGS,
            distributionView: "bands",
          }}
        />
        <MetricCard
          title="Median over runs"
          initialSettings={{
            ...DEFAULT_METRIC_VIEW_SETTINGS,
            aggregateRuns: true,
            runAggregation: "median",
          }}
        />
        <MetricCard
          title="One number"
          initialSettings={{
            ...DEFAULT_METRIC_VIEW_SETTINGS,
            aggregateRuns: true,
            aggregateTime: true,
          }}
        />
        <MetricCard title="Waiting" frames={[]} />
        <ChartCard
          title="Plain card"
          subtitle="anything else in the same chrome"
          help="A card with no chart, showing the footer row."
          actions={placeholderMenu}
          bodyHeight={PLOT_HEIGHT}
          footer={<span>a footer line</span>}
        >
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#888",
            }}
          >
            body
          </div>
        </ChartCard>
      </ChartCardGrid>
      <p style={{ fontSize: 12, color: "#888", margin: 0 }}>
        Every card above is {chartCardHeight({ bodyHeight: PLOT_HEIGHT })}px
        tall; picking another view from a card&apos;s menu changes only what it
        draws.
      </p>
    </div>
  ),
};

export const Paused: Story = {
  render: () => (
    <div style={{ width: 480 }}>
      <ChartCard
        title="Infected"
        subtitle="heatmap · value over time"
        tone="paused"
        actions={
          <>
            <Chip size="xs" variant="outline" color="grey">
              Paused
            </Chip>
            {placeholderMenu}
          </>
        }
        bodyHeight={PLOT_HEIGHT}
      >
        <ExperimentMetricTimeline
          frames={frames}
          settings={DEFAULT_METRIC_VIEW_SETTINGS}
          expectedOutputType="distribution"
          timeDomain={[0, FRAME_COUNT - 1]}
          plotHeight={PLOT_HEIGHT}
        />
      </ChartCard>
    </div>
  ),
};

export const Muted: Story = {
  render: () => (
    <div style={{ width: 480 }}>
      <ChartCard
        title="Parameter importance"
        subtitle="fitted on 12 completed steps · below the 100-step floor"
        tone="muted"
        actions={placeholderMenu}
        bodyHeight={PLOT_HEIGHT}
      >
        <ExperimentMetricTimeline
          frames={frames}
          settings={DEFAULT_METRIC_VIEW_SETTINGS}
          expectedOutputType="distribution"
          timeDomain={[0, FRAME_COUNT - 1]}
          plotHeight={PLOT_HEIGHT}
        />
      </ChartCard>
    </div>
  ),
};
