/**
 * The module factory for the `vi.mock` call of the experiment panel's suite.
 * uPlot cannot mount in jsdom, so the timeline is a stub while the card chrome
 * around it (the menu, the subtitle, the tone) stays real.
 */
import { vi } from "vitest";

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
