import { use, useEffect, useState, useSyncExternalStore } from "react";

import { SOLVER_ERROR_DIAGNOSTIC } from "@hashintel/petrinaut-core";

import { useSDCPNState } from "../../../../../../../react/document/sdcpn-context";
import { usePetrinautDefinitionSelector } from "../../../../../../../react/document/use-document";
import { SimulationContext } from "../../../../../../../react/simulation/context";
import { buildTimelineSeriesConfig } from "../simulation-timeline/series-config";
import { useRunTimelineView } from "../simulation-timeline/use-run-timeline-view";
import {
  createTimelineSeriesStore,
  type TimelineSeriesSnapshot,
  type TimelineSeriesSource,
  type TimelineSeriesStore,
  type TimelineSeriesView,
} from "./series-store";
import { useTimelineMetric } from "./use-timeline-metric";

import type { EventTimelineData, FiringMark } from "./series";
import type { TraceEvent } from "@hashintel/petrinaut-core";

/**
 * The y axis of the solver error reaches at least this far: a run whose
 * places all advance exactly records zero everywhere, drawn along the floor.
 */
const SOLVER_ERROR_AXIS_MINIMUM = 1e-12;

/** Reads a place's accumulated solver error off an event, by frame place index. */
const solverErrorExtractor = (
  placeIndices: readonly (number | undefined)[],
): ((event: TraceEvent, seriesIndex: number) => number) => {
  return (event, seriesIndex) => {
    const placeIndex = placeIndices[seriesIndex];
    return placeIndex === undefined
      ? Number.NaN
      : (event.diagnostics?.[SOLVER_ERROR_DIAGNOSTIC]?.[placeIndex] ?? 0);
  };
};

export type TimeRange = { min: number; max: number };

/** Samples a continuous series is read at across the visible range. */
const SAMPLE_COUNT = 400;

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
  if (left.kind === "steps" && right.kind === "steps") {
    return (
      left.series === right.series &&
      left.extract === right.extract &&
      left.extractEvent === right.extractEvent
    );
  }
  if (left.kind === "sampled" && right.kind === "sampled") {
    return (
      left.series === right.series &&
      left.extract === right.extract &&
      left.sampleCount === right.sampleCount
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
  paused,
}: {
  /** The visible range as two numbers, so a resample follows a change of value, not of object. */
  viewMin: number;
  viewMax: number;
  /**
   * True while nobody can see the timeline: the store then stops following
   * the trace and the range, and catches up when this turns false.
   */
  paused: boolean;
}): {
  data: EventTimelineData | null;
  firings: readonly FiringMark[];
  /** Times of the reference frames recorded between firings. */
  references: readonly number[];
  metricError: string | null;
} {
  const { eventSimulation } = use(SimulationContext);
  const timelineView = useRunTimelineView();
  const colorsEnabled = useSDCPNState((document) => document.extensions.colors);
  const places = usePetrinautDefinitionSelector((net) => net.places);
  const types = usePetrinautDefinitionSelector((net) => net.types);
  const transitions = usePetrinautDefinitionSelector((net) => net.transitions);
  const metrics = usePetrinautDefinitionSelector((net) => net.metrics);

  const selectedMetric =
    timelineView.kind === "metric"
      ? (metrics?.find((metric) => metric.id === timelineView.metricId) ?? null)
      : null;
  const timelineMetric = useTimelineMetric(selectedMetric);

  const seriesConfig = buildTimelineSeriesConfig({
    timelineView,
    places,
    // Without colours a place's type is not found, so it takes a default colour.
    types: colorsEnabled ? types : [],
    transitions,
    selectedMetric,
    evaluateMetric: timelineMetric.evaluate,
  });

  // Counts, and a metric whose code reads only what changes at events, are
  // exact as steps read at the events; a metric that follows dynamics is
  // sampled between them. The solver's error is recorded on the events.
  const solverErrorPlaceIndices =
    timelineView.kind === "solver-error"
      ? seriesConfig.series.map((series) =>
          eventSimulation?.placeIndexById.get(
            series.seriesId.replace(/^solver-error__/, ""),
          ),
        )
      : null;
  const view: TimelineSeriesView =
    timelineView.kind === "per-transition"
      ? { kind: "lanes", transitions }
      : timelineView.kind === "metric" && timelineMetric.shape !== "discrete"
        ? {
            kind: "sampled",
            series: seriesConfig.series,
            extract: seriesConfig.extract,
            sampleCount: SAMPLE_COUNT,
          }
        : solverErrorPlaceIndices
          ? {
              kind: "steps",
              series: seriesConfig.series,
              extract: seriesConfig.extract,
              extractEvent: solverErrorExtractor(solverErrorPlaceIndices),
              axisMinimum: SOLVER_ERROR_AXIS_MINIMUM,
            }
          : {
              kind: "steps",
              series: seriesConfig.series,
              extract: seriesConfig.extract,
            };

  const store = useTimelineSeriesStore(eventSimulation, view);
  useEffect(() => (paused ? undefined : store?.attach()), [store, paused]);
  useEffect(() => {
    if (!paused) {
      store?.setViewRange(viewMin, viewMax);
    }
  }, [store, viewMin, viewMax, paused]);
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
