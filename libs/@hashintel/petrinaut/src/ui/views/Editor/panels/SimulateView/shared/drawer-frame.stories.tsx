/**
 * The frame on its own, with placeholder cards: at rest, the header shows
 * the title line, the stats line and the bar; once the body has scrolled it
 * condenses to one line of compact chips and grows back under the pointer.
 */
import { useEffect } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { ChartCard, ChartCardGrid, chartCardHeight } from "./chart-card";
import {
  ComputeBatchesChip,
  DrawerFrame,
  FrameBand,
  FrameColumns,
  FrameStat,
  FrameStatusPill,
} from "./drawer-frame";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Simulate / DrawerFrame",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const sectionStyle = css({
  display: "flex",
  height: "[100vh]",
  width: "full",
});

const placeholderStyle = css({
  height: "full",
  borderRadius: "md",
  backgroundColor: "neutral.s10",
});

const PLOT_HEIGHT = 220;
const CARD_HEIGHT = chartCardHeight({ bodyHeight: PLOT_HEIGHT });

const Stats = () => (
  <>
    <FrameStatusPill tone="active" minChars={14}>
      Running
    </FrameStatusPill>
    <FrameStat label="Runs" minChars={24}>
      900 active, 100 complete
    </FrameStat>
    <FrameStat label="Errors" minChars={5}>
      0
    </FrameStat>
    <FrameStat label="Time" minChars={11}>
      45 / 180
    </FrameStat>
    <FrameStat label="Elapsed" minChars={8}>
      4m 02s
    </FrameStat>
    <FrameStat label="Selection" minChars={17}>
      61 / 100 runs
    </FrameStat>
    <ComputeBatchesChip
      batches={[
        {
          id: "1",
          label: "Selection",
          tone: "priority",
          runCount: 100,
          completedRuns: 61,
        },
        {
          id: "2",
          label: "Surface",
          tone: "background",
          runCount: 24,
          completedRuns: 9,
        },
      ]}
    />
  </>
);

const Cards = ({ count }: { count: number }) => (
  <ChartCardGrid minColumnWidth={320} rowHeight={CARD_HEIGHT}>
    {Array.from({ length: count }, (_, index) => (
      <ChartCard
        key={index}
        title={`Metric ${index + 1}`}
        subtitle="heatmap · value over time"
        bodyHeight={PLOT_HEIGHT}
      >
        <div className={placeholderStyle} />
      </ChartCard>
    ))}
  </ChartCardGrid>
);

const Frame = ({ cards }: { cards: number }) => (
  <div className={sectionStyle}>
    <DrawerFrame
      title="SIR transmission sweep · Seasonal Flu · 100 runs · dt 1"
      stats={<Stats />}
      badge={<span>CPU</span>}
      progress={61}
      footer={<span>Actions</span>}
    >
      <FrameColumns
        primary={
          <>
            <FrameBand title="Parameters" help="Placeholder controls.">
              <div className={placeholderStyle} style={{ height: 60 }} />
            </FrameBand>
            <ChartCard
              title="Surface"
              subtitle="121 of 121 points sampled"
              bodyHeight={280}
              footer={<span>X · Y · Metric</span>}
              footerHeight={24}
            >
              <div className={placeholderStyle} />
            </ChartCard>
          </>
        }
        secondary={<Cards count={cards} />}
      />
    </DrawerFrame>
  </div>
);

export const AtRest: Story = {
  name: "At rest",
  render: () => <Frame cards={4} />,
};

/** Scrolls the body once mounted, so the story opens on the condensed header. */
const ScrolledFrame = () => {
  useEffect(() => {
    document.querySelector("[data-frame-body]")?.scrollTo(0, 160);
  }, []);
  return <Frame cards={8} />;
};

export const Condensed: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The body has scrolled: the stats line folded into the title line as compact chips and the header is 36px tall. Move the pointer over it to see it grow back.",
      },
    },
  },
  render: () => <ScrolledFrame />,
};
