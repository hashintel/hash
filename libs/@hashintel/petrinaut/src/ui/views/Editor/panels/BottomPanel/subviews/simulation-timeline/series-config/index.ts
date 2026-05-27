import {
  type Color,
  type Metric,
  type Place,
  type Transition,
} from "@hashintel/petrinaut-core";

import { buildMetricSeriesConfig } from "./metric";
import { buildPerPlaceSeriesConfig } from "./per-place";
import { buildPerTransitionSeriesConfig } from "./per-transition";
import { buildPerTypeSeriesConfig } from "./per-type";

import type { TimelineView } from "../../../../../../../../react/state/editor-context";
import type { TimelineSeriesConfig } from "../types";

/**
 * Selects the timeline series builder for the active timeline view.
 *
 * The streaming hook calls this once per view/net/metric change, then uses the
 * returned series metadata and frame extractor while appending simulation data.
 */
export function buildTimelineSeriesConfig(args: {
  timelineView: TimelineView;
  places: Place[];
  types: Color[];
  transitions: Transition[];
  selectedMetric: Metric | null;
  /**
   * True once the sandbox has finished building a {@link MetricEvaluator}
   * for `selectedMetric`. The metric series is suppressed (empty) until
   * the evaluator is ready, so the chart doesn't render an empty line.
   */
  metricReady: boolean;
}): TimelineSeriesConfig {
  const {
    timelineView,
    places,
    types,
    transitions,
    selectedMetric,
    metricReady,
  } = args;

  switch (timelineView.kind) {
    case "metric":
      return buildMetricSeriesConfig({
        metric: selectedMetric,
        metricReady,
      });
    case "per-transition":
      return buildPerTransitionSeriesConfig({ transitions });
    case "per-type":
      return buildPerTypeSeriesConfig({ places, types });
    case "per-place":
      return buildPerPlaceSeriesConfig({ places, types });
  }
}
