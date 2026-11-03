import { use } from "react";

import { EventPlaybackContext } from "../../../../../../../react/event-playback/context";
import { SimulationContext } from "../../../../../../../react/simulation/context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { buildTimelineSeriesConfig } from "../simulation-timeline/series-config";
import { useTimelineMetric } from "../simulation-timeline/use-streaming-data";
import {
  buildLaneData,
  buildSampledData,
  buildStepData,
  collectFirings,
  collectReferenceTimes,
  transitionColors,
  type EventTimelineData,
  type FiringMark,
} from "./series";

export type TimeRange = { min: number; max: number };

/**
 * The event timeline's data for the active timeline view, rebuilt from the
 * trace as events arrive. Token counts per place or type are stepped at the
 * events; a user metric is sampled over the visible range, since it may read
 * attributes that evolve between events; transition firings are lanes.
 */
export function useEventTimelineData({
  viewRange,
  sampleCount,
}: {
  viewRange: TimeRange;
  sampleCount: number;
}): {
  data: EventTimelineData | null;
  firings: FiringMark[];
  /** Times of the reference frames recorded between firings. */
  references: number[];
  metricError: string | null;
} {
  const { eventSimulation } = use(SimulationContext);
  const { eventCount, coveredTime } = use(EventPlaybackContext);
  const { timelineView } = use(EditorContext);
  const {
    extensions,
    petriNetDefinition: { places, types, transitions, metrics },
  } = use(SDCPNContext);

  const selectedMetric =
    timelineView.kind === "metric"
      ? (metrics?.find((metric) => metric.id === timelineView.metricId) ?? null)
      : null;
  const timelineMetric = useTimelineMetric(selectedMetric);

  const colorsEnabled = extensions.colors;
  const seriesConfig = buildTimelineSeriesConfig({
    timelineView,
    places: colorsEnabled
      ? places
      : places.map((place) => ({ ...place, colorId: null })),
    types: colorsEnabled ? types : [],
    transitions,
    selectedMetric,
    evaluateMetric: timelineMetric.evaluate,
  });

  if (!eventSimulation || eventCount === 0) {
    return {
      data: null,
      firings: [],
      references: [],
      metricError: timelineMetric.error,
    };
  }

  const firings = collectFirings(
    eventSimulation,
    eventCount,
    transitionColors(transitions),
  );
  const references = collectReferenceTimes(eventSimulation, eventCount);

  switch (timelineView.kind) {
    case "per-transition":
      return {
        data: buildLaneData(eventSimulation, eventCount, transitions),
        firings,
        references,
        metricError: null,
      };
    case "metric":
      return {
        data: {
          kind: "sampled",
          series: seriesConfig.series,
          data: buildSampledData(
            eventSimulation,
            viewRange.min,
            Math.min(viewRange.max, coveredTime),
            sampleCount,
            seriesConfig.series,
            seriesConfig.extract,
          ),
        },
        firings,
        references,
        metricError: timelineMetric.error,
      };
    case "per-place":
    case "per-type":
      return {
        data: {
          kind: "steps",
          series: seriesConfig.series,
          data: buildStepData(
            eventSimulation,
            eventCount,
            coveredTime,
            seriesConfig.series,
            seriesConfig.extract,
          ),
        },
        firings,
        references,
        metricError: null,
      };
  }
}
