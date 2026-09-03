/**
 * The study drawer against fake compute. For a connected study the
 * navigator follows each step while the study runs, then the surface, the
 * controls and the chart move together when the parameters are picked by
 * hand; the selection stream is faked from the synthetic objective and
 * refines in three batches after every move.
 */
import { useEffect, useState } from "react";

import {
  type OptimizationNavigation,
  OptimizationsContext,
  type OptimizationsContextValue,
  type OptimizationStatus,
} from "../../../../../../react/optimizations/context";
import { FakeExperimentsProvider } from "../experiments/experiments-story-fixtures";
import {
  makeOptimizationInput,
  makeOptimizationRecord,
  makeSelectionStream,
  makeSyntheticObjectiveSampler,
  makeTrials,
  navigationAtTrial,
  navigationKey,
  optimizedBindingSets,
} from "./optimizations-story-fixtures";
import { ViewOptimizationDrawer } from "./view-optimization-drawer";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Simulate / ViewOptimizationDrawer",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const input = makeOptimizationInput(optimizedBindingSets.logScale);
const allTrials = makeTrials(input, 30);

/** The refinement ladder a navigated point climbs, one rung per 900 ms. */
const REFINEMENT_LADDER = [8, 25, 100];

const FakeConnectedStudy = ({
  running,
  fallbackReason = null,
  refinementError = null,
}: {
  /** Streams one step every 1.2 s and follows them; else shows the complete study. */
  running: boolean;
  fallbackReason?: string | null;
  /** Set to have every navigated point fail with this reason instead of refining. */
  refinementError?: string | null;
}) => {
  const [shown, setShown] = useState(running ? 1 : allTrials.trials.length);
  useEffect(() => {
    if (!running || shown >= allTrials.trials.length) {
      return;
    }
    const timer = setTimeout(() => setShown((previous) => previous + 1), 1_200);
    return () => clearTimeout(timer);
  }, [running, shown]);
  const trials = allTrials.trials.slice(0, shown);
  const latest = trials.at(-1)!;
  const studyRunning = running && shown < allTrials.trials.length;
  const status: OptimizationStatus = studyRunning ? "running" : "complete";

  const [chosen, setChosen] = useState<OptimizationNavigation>(() =>
    navigationAtTrial(input, latest, true),
  );
  // While following, the navigation is wherever the latest step is.
  const navigation =
    chosen.followTrials && studyRunning
      ? navigationAtTrial(input, latest, true)
      : chosen;
  const key = navigationKey(input, navigation);

  const [refinement, setRefinement] = useState({ key, rung: 0 });
  if (refinement.key !== key) {
    setRefinement({ key, rung: 0 });
  }
  useEffect(() => {
    if (refinement.rung >= REFINEMENT_LADDER.length - 1) {
      return;
    }
    const timer = setTimeout(
      () =>
        setRefinement((previous) =>
          previous.key === key ? { key, rung: previous.rung + 1 } : previous,
        ),
      900,
    );
    return () => clearTimeout(timer);
  }, [key, refinement.rung]);

  const following = navigation.followTrials && studyRunning;
  const rung = refinement.key === key ? refinement.rung : 0;
  const selection = following
    ? makeSelectionStream({
        input,
        navigation,
        followedTrial: latest.trial,
        runsCompleted: 1,
        computing: true,
      })
    : refinementError !== null
      ? makeSelectionStream({
          input,
          navigation,
          runsCompleted: 0,
          error: refinementError,
        })
      : makeSelectionStream({
          input,
          navigation,
          runsCompleted: REFINEMENT_LADDER[rung]!,
          runTarget: REFINEMENT_LADDER[rung + 1] ?? null,
          computing: rung < REFINEMENT_LADDER.length - 1,
        });

  const optimization = makeOptimizationRecord({
    input,
    trials,
    best: latest.best,
    status,
    computeBackendFallbackReason: fallbackReason,
    navigation,
    selection,
  });

  const value: OptimizationsContextValue = {
    optimizations: [optimization],
    selectedOptimizationId: optimization.id,
    selectedOptimization: optimization,
    setSelectedOptimizationId: () => {},
    createOptimization: () => Promise.resolve(optimization.id),
    cancelOptimization: () => {},
    removeOptimization: () => {},
    setOptimizationNavigation: (_optimizationId, patch) =>
      setChosen({ ...navigation, ...patch }),
    retryOptimization: () => Promise.resolve(null),
  };

  return (
    <OptimizationsContext value={value}>
      <FakeExperimentsProvider
        initialExperiments={[]}
        overrides={{
          sampleDetachedObjective: makeSyntheticObjectiveSampler(() => 80),
        }}
      >
        <ViewOptimizationDrawer
          open
          onClose={() => {}}
          optimization={optimization}
        />
      </FakeExperimentsProvider>
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
    input,
    trials: allTrials.trials,
    best: allTrials.best,
    status: "complete",
  });
  const value: OptimizationsContextValue = {
    optimizations: [optimization],
    selectedOptimizationId: optimization.id,
    selectedOptimization: optimization,
    setSelectedOptimizationId: () => {},
    createOptimization: () => Promise.resolve(optimization.id),
    cancelOptimization: () => {},
    removeOptimization: () => {},
    setOptimizationNavigation: () => {},
    retryOptimization: () => Promise.resolve(null),
  };

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
