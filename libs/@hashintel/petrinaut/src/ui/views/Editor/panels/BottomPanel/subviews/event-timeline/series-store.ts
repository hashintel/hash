/**
 * The event timeline's columns as a store: built from the trace once, then
 * extended as events arrive, so a batch costs the events it brought rather
 * than the whole run.
 *
 * Steps and lanes are append-only: each event's values are read once and
 * kept. A sampled metric reads the interpolated state on a time grid whose
 * step is a round number for the visible span, so the grid holds still while
 * the view follows the run or pans, and only new cells are evaluated. Cells
 * past the last recorded event were extrapolated, so they are read again
 * once more events arrive.
 */

import { FIRING_COLOR } from "./series";

import type {
  TimelineSeriesExtractor,
  TimelineSeriesMeta,
} from "../simulation-timeline/types";
import type { EventTimelineData, FiringMark, TraceReader } from "./series";
import type {
  EventTraceSummary,
  ReadableStore,
  Transition,
} from "@hashintel/petrinaut-core";
import type uPlot from "uplot";

/**
 * How often the chart takes new data while the run is live. The playhead
 * moves on its own overlay between updates, so the series can arrive in
 * steps, and each step is a full redraw of every series by uPlot.
 */
export const TRACE_UPDATE_INTERVAL_MS = 250;

export type TimelineSeriesSource = TraceReader & {
  trace: ReadableStore<EventTraceSummary>;
};

export type TimelineSeriesView =
  | {
      kind: "steps";
      series: readonly TimelineSeriesMeta[];
      extract: TimelineSeriesExtractor;
    }
  | {
      kind: "sampled";
      series: readonly TimelineSeriesMeta[];
      extract: TimelineSeriesExtractor;
      /** Samples across the visible span, give or take the grid's rounding. */
      sampleCount: number;
    }
  | { kind: "lanes"; transitions: readonly Transition[] };

export type TimelineSeriesSnapshot = {
  /** Null until the trace holds an event. */
  data: EventTimelineData | null;
  firings: readonly FiringMark[];
  references: readonly number[];
};

export type TimelineSeriesStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => TimelineSeriesSnapshot;
  /** Follows the trace from here on; returns the stop. */
  attach: () => () => void;
  /** The visible span, which only a sampled view reads. */
  setViewRange: (min: number, max: number) => void;
};

type Range = { min: number; max: number };

type ColumnBuilder = {
  /**
   * Extends the columns with events `from` to `to`, exclusive, and returns
   * the data to draw up to `coveredTime` over `range`.
   */
  update(
    source: TraceReader,
    from: number,
    to: number,
    coveredTime: number,
    range: Range,
  ): EventTimelineData;
};

/** A row per event, plus a last row carrying the values to the covered time. */
const createStepBuilder = ({
  series,
  extract,
}: Extract<TimelineSeriesView, { kind: "steps" }>): ColumnBuilder => {
  const times: number[] = [];
  const columns = series.map((): number[] => []);
  let hasTail = false;
  return {
    update(source, from, to, coveredTime) {
      if (hasTail) {
        times.pop();
        for (const column of columns) {
          column.pop();
        }
        hasTail = false;
      }
      for (let index = from; index < to; index++) {
        const event = source.getEvent(index);
        const reader = source.getEventState(index);
        if (!event || !reader) {
          continue;
        }
        times.push(event.time);
        for (const [seriesIndex, column] of columns.entries()) {
          column.push(extract(reader, seriesIndex, event.time));
        }
      }
      const last = times[times.length - 1];
      if (last !== undefined && coveredTime > last) {
        times.push(coveredTime);
        for (const column of columns) {
          column.push(column[column.length - 1] ?? 0);
        }
        hasTail = true;
      }
      return {
        kind: "steps",
        series: series as TimelineSeriesMeta[],
        data: [times, ...columns] as uPlot.AlignedData,
      };
    },
  };
};

/** One lane per transition, the first on top, a point per firing. */
const createLaneBuilder = ({
  transitions,
}: Extract<TimelineSeriesView, { kind: "lanes" }>): ColumnBuilder => {
  const laneOf = new Map(
    transitions.map((transition, index) => [
      transition.id,
      transitions.length - 1 - index,
    ]),
  );
  const times: number[] = [];
  const columns = transitions.map((): (number | null)[] => []);
  const series = transitions.map((transition) => ({
    seriesId: `transition__${transition.id}`,
    seriesName: transition.name,
    color: FIRING_COLOR,
  }));
  const laneLabels = [...transitions]
    .reverse()
    .map((transition) => transition.name);
  return {
    update(source, from, to) {
      for (let index = from; index < to; index++) {
        const event = source.getEvent(index);
        if (!event || event.firedTransitionIds.length === 0) {
          continue;
        }
        times.push(event.time);
        const fired = new Set(event.firedTransitionIds);
        for (const [transitionIndex, transition] of transitions.entries()) {
          columns[transitionIndex]!.push(
            fired.has(transition.id) ? laneOf.get(transition.id)! : null,
          );
        }
      }
      return {
        kind: "lanes",
        series,
        data: [times, ...columns] as uPlot.AlignedData,
        laneLabels,
      };
    },
  };
};

/** The largest of 1, 2 or 5 times a power of ten that is at most `value`. */
export const niceStep = (value: number): number => {
  const base = 10 ** Math.floor(Math.log10(value));
  const mantissa = value / base;
  return (mantissa >= 5 ? 5 : mantissa >= 2 ? 2 : 1) * base;
};

/** Cells kept beyond the visible span before the cache starts over. */
const SAMPLE_CACHE_LIMIT = 20;

/** The interpolated state read on a round time grid over the visible span. */
const createSampleBuilder = ({
  series,
  extract,
  sampleCount,
}: Extract<TimelineSeriesView, { kind: "sampled" }>): ColumnBuilder => {
  let step = 0;
  let cachedEvents = 0;
  const cache = new Map<number, { values: number[]; provisional: boolean }>();
  return {
    update(source, _from, eventCount, coveredTime, range) {
      const span = Math.max(range.max - range.min, Number.EPSILON);
      const nextStep = niceStep(span / Math.max(2, sampleCount));
      if (nextStep !== step || cache.size > SAMPLE_CACHE_LIMIT * sampleCount) {
        step = nextStep;
        cache.clear();
      }
      if (eventCount !== cachedEvents) {
        // Cells past the last event were carried forward along the
        // derivative; the events that arrived since may bend them.
        for (const [cell, entry] of cache) {
          if (entry.provisional) {
            cache.delete(cell);
          }
        }
        cachedEvents = eventCount;
      }
      const lastEventTime = source.getEvent(eventCount - 1)?.time ?? 0;
      const end = Math.min(range.max, coveredTime);
      const times: number[] = [];
      const columns = series.map((): number[] => []);
      for (let cell = Math.ceil(range.min / step); cell * step <= end; cell++) {
        // A grid time with the float noise of `cell * step` rounded away.
        const time = Number((cell * step).toPrecision(12));
        let entry = cache.get(cell);
        if (!entry) {
          const reader = source.getStateAt(time);
          if (!reader) {
            continue;
          }
          entry = {
            values: series.map((_, seriesIndex) =>
              extract(reader, seriesIndex, time),
            ),
            provisional: time >= lastEventTime,
          };
          cache.set(cell, entry);
        }
        times.push(time);
        for (const [seriesIndex, column] of columns.entries()) {
          column.push(entry.values[seriesIndex] ?? 0);
        }
      }
      return {
        kind: "sampled",
        series: series as TimelineSeriesMeta[],
        data: [times, ...columns] as uPlot.AlignedData,
      };
    },
  };
};

const createBuilder = (view: TimelineSeriesView): ColumnBuilder => {
  switch (view.kind) {
    case "steps":
      return createStepBuilder(view);
    case "lanes":
      return createLaneBuilder(view);
    case "sampled":
      return createSampleBuilder(view);
  }
};

export const createTimelineSeriesStore = (
  source: TimelineSeriesSource,
  view: TimelineSeriesView,
): TimelineSeriesStore => {
  const listeners = new Set<() => void>();
  const builder = createBuilder(view);
  const firings: FiringMark[] = [];
  const references: number[] = [];
  let builtEvents = 0;
  let range: Range = { min: 0, max: 0 };
  let snapshot: TimelineSeriesSnapshot = {
    data: null,
    firings,
    references,
  };

  const rebuild = () => {
    const { eventCount, coveredTime } = source.trace.get();
    for (let index = builtEvents; index < eventCount; index++) {
      const event = source.getEvent(index);
      if (!event) {
        break;
      }
      if (event.firedTransitionIds.length > 0) {
        firings.push({
          time: event.time,
          transitionIds: event.firedTransitionIds,
        });
      }
      if (event.kind === "reference") {
        references.push(event.time);
      }
    }
    const data =
      eventCount === 0
        ? null
        : builder.update(source, builtEvents, eventCount, coveredTime, range);
    builtEvents = eventCount;
    snapshot = { data, firings, references };
  };
  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  rebuild();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    attach() {
      // Catch up on what arrived between creation and now, then follow,
      // taking the trace's updates at most every interval.
      rebuild();
      notify();
      let lastUpdate = Date.now();
      let timer: ReturnType<typeof setTimeout> | null = null;
      const unsubscribe = source.trace.subscribe(() => {
        if (timer !== null) {
          return;
        }
        const wait = Math.max(
          0,
          TRACE_UPDATE_INTERVAL_MS - (Date.now() - lastUpdate),
        );
        timer = setTimeout(() => {
          timer = null;
          lastUpdate = Date.now();
          rebuild();
          notify();
        }, wait);
      });
      return () => {
        unsubscribe();
        if (timer !== null) {
          clearTimeout(timer);
        }
      };
    },
    setViewRange(min, max) {
      if (min === range.min && max === range.max) {
        return;
      }
      range = { min, max };
      if (view.kind !== "sampled" || snapshot.data === null) {
        return;
      }
      const { coveredTime } = source.trace.get();
      snapshot = {
        ...snapshot,
        data: builder.update(
          source,
          builtEvents,
          builtEvents,
          coveredTime,
          range,
        ),
      };
      notify();
    },
  };
};
