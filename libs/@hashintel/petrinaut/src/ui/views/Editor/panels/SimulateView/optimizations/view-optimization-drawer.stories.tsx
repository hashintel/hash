/**
 * The study drawer against fake records. For a connected study the navigator
 * and the surface follow each step while the study runs — the step in flight
 * streams its running objective into the surface before its dot lands — then
 * the surface, the controls and the chart move together when the parameters
 * are picked by hand; the selection stream is faked from the synthetic
 * objective and refines in three batches after every move.
 */
import { OptimizationsContext } from "../../../../../../react/optimizations/context";
import { FakeExperimentsProvider } from "../experiments/experiments-story-fixtures";
import {
  fakeStudyInput,
  fakeStudyTrials,
  makeOptimizationRecord,
  makeOptimizationsContextValue,
  useFakeConnectedStudy,
} from "./optimizations-story-fixtures";
import { ViewOptimizationDrawer } from "./view-optimization-drawer";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Simulate / ViewOptimizationDrawer",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const FakeConnectedStudy = (props: {
  /** Lands one step every 1.2 s and follows the next; else shows the complete study. */
  running: boolean;
  /** The study with a parameter and a state constraint, results on every step. */
  constrained?: boolean;
  fallbackReason?: string | null;
  refinementError?: string | null;
}) => {
  const { optimization, value } = useFakeConnectedStudy(props);

  return (
    <OptimizationsContext value={value}>
      <ViewOptimizationDrawer
        open
        onClose={() => {}}
        optimization={optimization}
      />
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

export const ConnectedWithConstraints: Story = {
  name: "Connected study with constraints",
  parameters: {
    docs: {
      description: {
        story:
          "The complete study with a parameter constraint (production rate under 350) and a state constraint (finished goods under 500): the Constraints card with the steps clear across the study and one bar per state constraint, a Steps clear stat in the strip, a Runs passed column in the steps table, and the draws that broke the rate cap greyed as infeasible everywhere a step is drawn.",
      },
    },
  },
  render: () => <FakeConnectedStudy running={false} constrained />,
};

export const ConnectedWithConstraintsRunning: Story = {
  name: "Connected study with constraints, following steps",
  render: () => <FakeConnectedStudy running constrained />,
};

export const ConnectedRefinementFailed: Story = {
  name: "Connected study whose point could not compute",
  render: () => (
    <FakeConnectedStudy
      running={false}
      refinementError="metric__profit: Unexpected token ')'"
    />
  ),
};

export const ConnectedAfterGpuFallback: Story = {
  name: "Connected study after GPU fallback",
  render: () => (
    <FakeConnectedStudy
      running={false}
      fallbackReason='metric "Profit" is an expression metric, which the GPU backend cannot compute'
    />
  ),
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
        <ViewOptimizationDrawer
          open
          onClose={() => {}}
          optimization={optimization}
        />
      </FakeExperimentsProvider>
    </OptimizationsContext>
  );
};

export const Remote: Story = {
  name: "Remote study",
  render: () => <RemoteStudy />,
};
