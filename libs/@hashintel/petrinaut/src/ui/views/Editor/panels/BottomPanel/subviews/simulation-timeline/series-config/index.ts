import {
  type CompiledMetric,
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
  compiledMetric: CompiledMetric | null;
}): TimelineSeriesConfig {
  const {
    timelineView,
    places,
    types,
    transitions,
    selectedMetric,
    compiledMetric,
  } = args;

  switch (timelineView.kind) {
    case "metric":
      return buildMetricSeriesConfig({
        metric: selectedMetric,
        compiledMetric,
        places,
      });
    case "per-transition":
      return buildPerTransitionSeriesConfig({ transitions });
    case "per-type":
      return buildPerTypeSeriesConfig({ places, types });
    case "per-place":
      return buildPerPlaceSeriesConfig({ places, types });
  }
}
