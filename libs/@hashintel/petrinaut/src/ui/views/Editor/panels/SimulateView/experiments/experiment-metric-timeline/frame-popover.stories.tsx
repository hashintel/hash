/**
 * The click-to-inspect popover on its own, with the distribution shapes that
 * make its histogram hard: a long tail dominated by one bin, a wide spread,
 * a thousand exact bins, and a single sample.
 */
import { useRef } from "react";

import { FramePopover } from "./frame-popover";

import type { MetricFrame } from "./shared/metric-frames";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Simulate / FramePopover",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function distributionFrame(bins: [number, number][]): MetricFrame {
  const runSampleCount = bins.reduce(
    (sum, [, frequency]) => sum + frequency,
    0,
  );
  return {
    metricId: "infected",
    label: "Infected",
    outputType: "distribution",
    frameNumber: 906,
    time: 90.6,
    bins,
    value: null,
    frameValue: null,
    timeValue: null,
    runSampleCount,
    timeSampleCount: runSampleCount,
  };
}

/** A die-out tail: nearly everything at zero, a thin spread above it. */
const LONG_TAIL = distributionFrame([
  [0, 2038],
  [1, 651],
  ...Array.from(
    { length: 72 },
    (_, index) =>
      [index + 2, Math.max(1, Math.round(30 * Math.exp(-index / 14)))] as [
        number,
        number,
      ],
  ),
]);

/** A broad hump across a few hundred values. */
const WIDE_SPREAD = distributionFrame(
  Array.from({ length: 240 }, (_, index) => {
    const value = 40 + index;
    const frequency = Math.round(
      900 * Math.exp(-((value - 150) ** 2) / (2 * 38 ** 2)),
    );
    return [value, Math.max(0, frequency)] as [number, number];
  }).filter(([, frequency]) => frequency > 0),
);

/** More bins than the popover has pixels: they merge, nothing is dropped. */
const THOUSAND_BINS = distributionFrame(
  Array.from({ length: 1000 }, (_, index) => {
    const frequency = Math.round(
      50 * Math.exp(-((index - 400) ** 2) / (2 * 120 ** 2)) +
        20 * Math.exp(-((index - 780) ** 2) / (2 * 40 ** 2)),
    );
    return [index * 0.25, Math.max(0, frequency)] as [number, number];
  }).filter(([, frequency]) => frequency > 0),
);

const SINGLE_BIN = distributionFrame([[7, 1]]);

const PopoverStage = ({ frame }: { frame: MetricFrame }) => {
  const chartRootRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={chartRootRef} style={{ width: 520, height: 320 }}>
      <FramePopover
        frame={frame}
        pointer={{ clientX: 60, clientY: 60 }}
        chartRootRef={chartRootRef}
        onClose={() => {}}
      />
    </div>
  );
};

export const LongTail: Story = {
  render: () => <PopoverStage frame={LONG_TAIL} />,
};

export const WideSpread: Story = {
  render: () => <PopoverStage frame={WIDE_SPREAD} />,
};

export const ThousandBins: Story = {
  render: () => <PopoverStage frame={THOUSAND_BINS} />,
};

export const SingleBin: Story = {
  render: () => <PopoverStage frame={SINGLE_BIN} />,
};
