import { useEffect, useState } from "react";

import { EXPERIMENT_RUN_LADDER } from "../../../../../../react/experiments/parameter-grid";
import { ExperimentMetricTimeline } from "./experiment-metric-timeline";
import { sirInfectedFrame } from "./experiments-story-fixtures";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";
import type { MetricSize } from "./experiment-metric-timeline";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Simulate / ExperimentMetricTimeline",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

type MetricFrame = ExperimentRecord["metricFrames"][number];

const FRAME_COUNT = 46;

/** The synthetic SIR wave every story charts. */
const FIXTURE = { transmissionRate: 0.3, recoveryDays: 8, spread: 9 };

function buildFrames(runs: number, upTo = FRAME_COUNT): MetricFrame[] {
  return Array.from({ length: upTo }, (_, frameNumber) =>
    sirInfectedFrame({ frameNumber, ...FIXTURE, runs }),
  );
}

const Card = ({
  children,
  caption,
}: {
  children: React.ReactNode;
  caption?: string;
}) => (
  <div
    style={{
      width: 640,
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}
  >
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
      {children}
    </div>
    {caption ? (
      <p style={{ fontSize: 12, color: "#888", margin: 0 }}>{caption}</p>
    ) : null}
  </div>
);

const SizedTimeline = ({ frames }: { frames: readonly MetricFrame[] }) => {
  const [size, setSize] = useState<MetricSize>("large");
  return (
    <ExperimentMetricTimeline
      frames={frames}
      displaySize={size}
      onDisplaySizeChange={setSize}
    />
  );
};

/** New frames arrive one at a time, the way a running experiment streams. */
const StreamingFramesStory = () => {
  const [frames, setFrames] = useState<MetricFrame[]>([]);

  useEffect(() => {
    let frameNumber = 0;
    const timer = setInterval(() => {
      if (frameNumber >= FRAME_COUNT) {
        clearInterval(timer);
        return;
      }
      const frame = sirInfectedFrame({ frameNumber, ...FIXTURE, runs: 25 });
      frameNumber++;
      setFrames((previous) => [...previous, frame]);
    }, 120);
    return () => clearInterval(timer);
  }, []);

  return (
    <Card
      caption={`${frames.length} of ${FRAME_COUNT} frames received at 25 runs`}
    >
      <SizedTimeline frames={frames} />
    </Card>
  );
};

export const StreamingFrames: Story = {
  name: "Streaming frames",
  render: () => <StreamingFramesStory />,
};

/**
 * Whole distributions re-arrive as batches merge: every couple of seconds
 * the frames are replaced by versions at the next refinement rung, so the
 * histograms fill more bins and their sampling jitter fades.
 */
const RefiningDistributionsStory = () => {
  const [rungIndex, setRungIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setRungIndex((previous) => {
        if (previous >= EXPERIMENT_RUN_LADDER.length - 1) {
          clearInterval(timer);
          return previous;
        }
        return previous + 1;
      });
    }, 2_000);
    return () => clearInterval(timer);
  }, []);

  const runs = EXPERIMENT_RUN_LADDER[rungIndex]!;
  return (
    <Card
      caption={`Rung ${rungIndex + 1} of ${EXPERIMENT_RUN_LADDER.length} — every frame's distribution rebuilt at ${runs} runs`}
    >
      <SizedTimeline frames={buildFrames(runs)} />
    </Card>
  );
};

export const RefiningDistributions: Story = {
  name: "Refining distributions",
  render: () => <RefiningDistributionsStory />,
};

export const Complete: Story = {
  name: "Complete (1000 runs)",
  render: () => (
    <Card>
      <SizedTimeline frames={buildFrames(1_000)} />
    </Card>
  ),
};

export const Empty: Story = {
  name: "Waiting for data",
  render: () => (
    <Card>
      <SizedTimeline frames={[]} />
    </Card>
  ),
};
