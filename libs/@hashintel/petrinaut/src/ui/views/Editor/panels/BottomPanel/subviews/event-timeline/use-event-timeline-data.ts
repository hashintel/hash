import { use, useEffect, useState, useSyncExternalStore } from "react";

import { SimulationContext } from "../../../../../../../react/simulation/context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { buildTimelineSeriesConfig } from "../simulation-timeline/series-config";
import { useTimelineMetric } from "../simulation-timeline/use-streaming-data";
import {
  createTimelineSeriesStore,
  type TimelineSeriesSnapshot,
  type TimelineSeriesSource,
  type TimelineSeriesStore,
  type TimelineSeriesView,
} from "./series-store";

import type { EventTimelineData, FiringMark } from "./series";

export type TimeRange = { min: number; max: number };

const EMPTY_SNAPSHOT: TimelineSeriesSnapshot = {
  data: null,
  firings: [],
  references: [],
};
const subscribeToNothing = () => () => {};
const getEmptySnapshot = () => EMPTY_SNAPSHOT;

const sameView = (
  left: TimelineSeriesView | null,
  right: TimelineSeriesView | null,
): boolean => {
  if (left === null || right === null) {
    return left === right;
  }
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "lanes" && right.kind === "lanes") {
    return left.transitions === right.transitions;
  }
  if (left.kind !== "lanes" && right.kind !== "lanes") {
    return (
      left.series === right.series &&
      left.extract === right.extract &&
      (left.kind !== "sampled" ||
        right.kind !== "sampled" ||
        left.sampleCount === right.sampleCount)
    );
  }
  return false;
};

/**
 * One series store per run and view. A new run or a changed view starts a
 * new store; the previous one is left to the garbage collector once its
 * subscription effect has cleaned up.
 */
const useTimelineSeriesStore = (
  source: TimelineSeriesSource | null,
  view: TimelineSeriesView | null,
): TimelineSeriesStore | null => {
  const create = () =>
    source && view ? createTimelineSeriesStore(source, view) : null;
  const [current, setCurrent] = useState(() => ({
    source,
    view,
    store: create(),
  }));
  if (current.source !== source || !sameView(current.view, view)) {
    const next = { source, view, store: create() };
    setCurrent(next);
    return next.store;
  }
  return current.store;
};

/**
 * The event timeline's data for the active timeline view, kept by a store
 * that extends its columns as events arrive. Token counts per place or type
 * are stepped at the events; a user metric is sampled over the visible
 * range, since it may read attributes that evolve between events;
 * transition firings are lanes.
 */
export function useEventTimelineData({
  viewMin,
  viewMax,
  sampleCount,
}: {
  /** The visible range as two numbers, so a resample follows a change of value, not of object. */
  viewMin: number;
  viewMax: number;
  sampleCount: number;
}): {
  data: EventTimelineData | null;
  firings: readonly FiringMark[];
  /** Times of the reference frames recorded between firings. */
  references: readonly number[];
  metricError: string | null;
} {
  const { eventSimulation } = use(SimulationContext);
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

  const view: TimelineSeriesView =
    timelineView.kind === "per-transition"
      ? { kind: "lanes", transitions }
      : timelineView.kind === "metric"
        ? {
            kind: "sampled",
            series: seriesConfig.series,
            extract: seriesConfig.extract,
            sampleCount,
          }
        : {
            kind: "steps",
            series: seriesConfig.series,
            extract: seriesConfig.extract,
          };

  const store = useTimelineSeriesStore(eventSimulation, view);
  useEffect(() => store?.attach(), [store]);
  useEffect(() => {
    store?.setViewRange(viewMin, viewMax);
  }, [store, viewMin, viewMax]);
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? subscribeToNothing,
    store?.getSnapshot ?? getEmptySnapshot,
  );

  return {
    data: timelineMetric.error ? null : snapshot.data,
    firings: snapshot.firings,
    references: snapshot.references,
    metricError: timelineMetric.error,
  };
}
