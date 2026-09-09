/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { use } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OptimizationsContext } from "../../../../../../react/optimizations/context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { OptimizationFullView } from "./optimization-full-view";
import {
  makeConnectedStudyState,
  makeOptimizationInput,
  makeOptimizationRecord,
  makeOptimizationsContextValue,
  makeSelectionStream,
  makeTrials,
  navigationAtTrial,
  optimizedBindingSets,
} from "./optimizations-story-fixtures";

import type { ReactNode } from "react";

vi.mock("@hashintel/ds-components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hashintel/ds-components")>();
  const Slider = ({ value }: { value: number }) => (
    <input type="range" value={value} readOnly />
  );
  const Tooltip = ({ children }: { children: ReactNode }) => <>{children}</>;
  return { ...actual, Slider, Tooltip };
});

vi.mock("./optimization-surface", () => ({
  OptimizationSurface: () => <div data-testid="remote-surface" />,
  NavigatedOptimizationSurface: () => <div data-testid="navigated-surface" />,
}));

// uPlot cannot mount in jsdom; the cards around the charts are real.
vi.mock("./study-view/objective-history-chart", async () => {
  const chartCard = await vi.importActual<
    typeof import("../shared/chart-card")
  >("../shared/chart-card");
  return {
    ObjectiveHistoryCard: ({ plotHeight }: { plotHeight: number }) => (
      <chartCard.ChartCard title="Objective by step" bodyHeight={plotHeight}>
        <div data-testid="objective-history" />
      </chartCard.ChartCard>
    ),
  };
});

vi.mock("../experiments/experiment-metric-timeline", async () => {
  const [menu, describeView, viewState] = await Promise.all([
    vi.importActual<
      typeof import("../experiments/experiment-metric-timeline/metric-view-menu")
    >("../experiments/experiment-metric-timeline/metric-view-menu"),
    vi.importActual<
      typeof import("../experiments/experiment-metric-timeline/describe-metric-view")
    >("../experiments/experiment-metric-timeline/describe-metric-view"),
    vi.importActual<
      typeof import("../experiments/experiment-metric-timeline/view-state")
    >("../experiments/experiment-metric-timeline/view-state"),
  ]);
  return {
    MetricViewMenu: menu.MetricViewMenu,
    describeMetricView: describeView.describeMetricView,
    DEFAULT_METRIC_VIEW_SETTINGS: viewState.DEFAULT_METRIC_VIEW_SETTINGS,
    ExperimentMetricTimeline: () => <div data-testid="metric-timeline" />,
  };
});

afterEach(cleanup);

const input = makeOptimizationInput(optimizedBindingSets.base);
const { trials } = makeTrials(input, 5);
const navigation = navigationAtTrial(input, trials[2]!, true);

/** The editor context with the full presentation and a spy on its setter. */
const FullPresentation = ({
  setSimulatePresentation,
  children,
}: {
  setSimulatePresentation: (presentation: "drawer" | "full") => void;
  children: ReactNode;
}) => {
  const value = use(EditorContext);
  return (
    <EditorContext
      value={{
        ...value,
        simulatePresentation: "full",
        setSimulatePresentation,
      }}
    >
      {children}
    </EditorContext>
  );
};

const renderFullView = (
  optimization: ReturnType<typeof makeOptimizationRecord>,
  handlers: {
    setSelectedOptimizationId?: (id: string | null) => void;
    setSimulatePresentation?: (presentation: "drawer" | "full") => void;
    removeOptimization?: (id: string) => void;
  } = {},
) =>
  render(
    <FullPresentation
      setSimulatePresentation={handlers.setSimulatePresentation ?? (() => {})}
    >
      <OptimizationsContext
        value={makeOptimizationsContextValue(optimization, {
          setSelectedOptimizationId:
            handlers.setSelectedOptimizationId ?? (() => {}),
          removeOptimization: handlers.removeOptimization ?? (() => {}),
        })}
      >
        <OptimizationFullView optimization={optimization} />
      </OptimizationsContext>
    </FullPresentation>,
  );

describe("OptimizationFullView", () => {
  const running = makeOptimizationRecord({
    input,
    trials: trials.slice(0, 3),
    best: trials[2]!.best,
    status: "running",
    connected: makeConnectedStudyState(input, {
      navigation,
      selection: makeSelectionStream({
        input,
        navigation,
        followedTrial: 2,
        runsCompleted: 1,
        computing: true,
      }),
    }),
  });

  it("gives the section to one study: back, name, actions, and every card", () => {
    const setSelectedOptimizationId = vi.fn();
    const setSimulatePresentation = vi.fn();
    renderFullView(running, {
      setSelectedOptimizationId,
      setSimulatePresentation,
    });

    expect(screen.getByText(input.name)).toBeTruthy();
    expect(screen.getByText(/best step so far/u)).toBeTruthy();
    expect(screen.getByText("Objective by step")).toBeTruthy();
    expect(screen.getByText("Objective at the step in flight")).toBeTruthy();
    expect(screen.getByTestId("navigated-surface")).toBeTruthy();
    expect(screen.getByText("Best step so far")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Stop/u })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Close/u })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Back to list/u }));
    expect(setSelectedOptimizationId).toHaveBeenCalledWith(null);

    fireEvent.click(screen.getByRole("button", { name: /Show in drawer/u }));
    expect(setSimulatePresentation).toHaveBeenCalledWith("drawer");
  });

  it("shows the results once the study settled: no verdict, no live titles", () => {
    const setSelectedOptimizationId = vi.fn();
    const removeOptimization = vi.fn();
    const stopped = makeOptimizationRecord({
      input,
      trials: trials.slice(0, 3),
      best: trials[2]!.best,
      status: "cancelled",
      connected: makeConnectedStudyState(input, {
        navigation: { ...navigation, followTrials: false },
        selection: makeSelectionStream({ input, navigation, runsCompleted: 8 }),
        resumable: true,
      }),
    });
    renderFullView(stopped, { setSelectedOptimizationId, removeOptimization });

    expect(screen.getByText(/^Stopped after 3 of 30 steps/u)).toBeTruthy();
    expect(document.querySelector("[data-verdict]")).toBeNull();
    expect(screen.getByText("Objective at the selected point")).toBeTruthy();
    expect(screen.queryByText(/Following/u)).toBeNull();
    expect(screen.getByRole("button", { name: /Continue/u })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Remove/u }));
    expect(removeOptimization).toHaveBeenCalledWith(stopped.id);
    expect(setSelectedOptimizationId).toHaveBeenCalledWith(null);
  });
});
