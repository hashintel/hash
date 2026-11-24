import {
  type Color,
  type Metric,
  type Place,
  type Transition,
} from "@hashintel/petrinaut-core";

import {
  buildMetricSeriesConfig,
  type TimelineMetricEvaluator,
} from "./series-config/metric";
import { buildPerPlaceSeriesConfig } from "./series-config/per-place";
import { buildPerTransitionSeriesConfig } from "./series-config/per-transition";
import { buildPerTypeSeriesConfig } from "./series-config/per-type";
import { buildSolverErrorSeriesConfig } from "./series-config/solver-error";

import type { TimelineView } from "../../../../../../../../react/state/editor-context";
import type { TimelineSeriesConfig } from "./types";

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
  evaluateMetric: TimelineMetricEvaluator | null;
}): TimelineSeriesConfig {
  const {
    timelineView,
    places,
    types,
    transitions,
    selectedMetric,
    evaluateMetric,
  } = args;

  switch (timelineView.kind) {
    case "metric":
      return buildMetricSeriesConfig({
        metric: selectedMetric,
        evaluateMetric,
      });
    case "per-transition":
      return buildPerTransitionSeriesConfig({ transitions });
    case "per-type":
      return buildPerTypeSeriesConfig({ places, types });
    case "per-place":
      return buildPerPlaceSeriesConfig({ places, types });
    case "solver-error":
      return buildSolverErrorSeriesConfig({ places, types });
  }
}
