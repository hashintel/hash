/**
 * Module factories for the `vi.mock` calls the study suites share. uPlot
 * cannot mount in jsdom, so the charts are stubs while the card chrome around
 * them (the menu, the subtitle, the tone) stays real.
 */
import { vi } from "vitest";

import type { ChartCardTone } from "./chart-card";

/**
 * Replaces `../experiments/experiment-metric-timeline`: the menu, the view
 * description and the default settings are the real ones, the timeline
 * itself prints what it was handed.
 */
export const mockExperimentMetricTimelineModule = async () => {
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
    ExperimentMetricTimeline: ({
      frames,
      contentEpoch,
      plotHeight,
    }: {
      frames: readonly unknown[];
      contentEpoch: string;
      plotHeight: number;
    }) => (
      <div
        data-testid="metric-timeline"
        data-epoch={contentEpoch}
        data-plot-height={plotHeight}
      >
        {frames.length} frames
      </div>
    ),
  };
};

/** Replaces the objective-history module: a real `ChartCard` around a stub plot. */
export const mockObjectiveHistoryCardModule = async () => {
  const chartCard =
    await vi.importActual<typeof import("./chart-card")>("./chart-card");
  return {
    ObjectiveHistoryCard: ({
      plotHeight,
      tone,
    }: {
      plotHeight: number;
      tone?: ChartCardTone;
    }) => (
      <chartCard.ChartCard
        title="Objective by step"
        bodyHeight={plotHeight}
        tone={tone}
      >
        <div data-testid="objective-history" />
      </chartCard.ChartCard>
    ),
  };
};
