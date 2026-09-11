/**
 * One study as the whole Optimizations section, against the same fake
 * records as the drawer stories: the header line with its verdict chip, the
 * summary, the navigator, the objective by step beside the surface and the
 * objective at the selected point, and the steps filling the rest.
 */
import { OptimizationsContext } from "../../../../../../react/optimizations/context";
import { FakeExperimentsProvider } from "../experiments/experiments-story-fixtures";
import {
  fakeStudyInput,
  fakeStudyTrials,
  makeOptimizationRecord,
  makeOptimizationsContextValue,
  useFakeConnectedStudy,
} from "../experiments/study-fixtures";
import { OptimizationFullView } from "./optimization-full-view";

import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";

const meta = {
  title: "Simulate / OptimizationFullView",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/** The section's frame: the full view fills the viewport the way the editor gives it the section. */
const SectionFrame = ({ children }: { children: ReactNode }) => (
  <div style={{ height: "100vh", display: "flex" }}>{children}</div>
);

const FakeConnectedStudy = ({
  running,
  paused = false,
}: {
  running: boolean;
  paused?: boolean;
}) => {
  const { optimization, value } = useFakeConnectedStudy({ running, paused });

  return (
    <OptimizationsContext value={value}>
      <SectionFrame>
        <OptimizationFullView optimization={optimization} />
      </SectionFrame>
    </OptimizationsContext>
  );
};

export const ConnectedRunning: Story = {
  name: "Connected study, following steps",
  render: () => <FakeConnectedStudy running />,
};

export const ConnectedComplete: Story = {
  name: "Connected study, complete",
  render: () => <FakeConnectedStudy running={false} />,
};

export const ConnectedPaused: Story = {
  name: "Connected study, paused",
  render: () => <FakeConnectedStudy running={false} paused />,
};

const RemoteStudy = () => {
  const optimization = makeOptimizationRecord({
    input: fakeStudyInput,
    trials: fakeStudyTrials.trials,
    best: fakeStudyTrials.best,
    status: "complete",
  });
  const value = makeOptimizationsContextValue(optimization);

  return (
    <OptimizationsContext value={value}>
      <FakeExperimentsProvider initialExperiments={[]}>
        <SectionFrame>
          <OptimizationFullView optimization={optimization} />
        </SectionFrame>
      </FakeExperimentsProvider>
    </OptimizationsContext>
  );
};

export const Remote: Story = {
  name: "Remote study",
  render: () => <RemoteStudy />,
};
