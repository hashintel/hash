// -- Streaming data hook (uPlot-native columnar format) -----------------------
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { use, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { StreamingStore, TimelineSeriesMeta } from "./types";
import {
  type CompiledMetric,
  compileMetric,
} from "../../../../../../../core/simulation/authoring/compile-metric";
import { buildMetricState } from "../../../../../../../core/simulation/frames/metric-state";
import {
  SimulationContext,
  type SimulationFrameReader,
} from "../../../../../../../react/simulation/context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { DEFAULT_COLORS } from "./default-colors";

function createEmptyStore(series: TimelineSeriesMeta[]): StreamingStore {
  return {
    series,
    columns: [[], ...series.map(() => [])],
    length: 0,
    revision: 0,
  };
}

function resetStore(store: StreamingStore, series: TimelineSeriesMeta[]): void {
  Object.assign(store, {
    series,
    columns: [[], ...series.map(() => [])],
    length: 0,
    revision: store.revision + 1,
  });
}

interface StreamingStoreSnapshot {
  store: StreamingStore;
  revision: number;
}

/**
 * A single extractor returns the value for series `seriesIdx` at the given
 * frame. Returning NaN leaves a gap on the chart.
 */
type SeriesExtractor = (
  frame: SimulationFrameReader,
  seriesIdx: number,
) => number;

interface StreamingStoreController {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => StreamingStoreSnapshot;
  getLength: () => number;
  reset: (series: TimelineSeriesMeta[]) => void;
  resetCurrentSeries: () => void;
  appendFrames: (
    frames: SimulationFrameReader[],
    extract: SeriesExtractor,
  ) => void;
}

function createStreamingStoreController(
  series: TimelineSeriesMeta[],
): StreamingStoreController {
  const listeners = new Set<() => void>();
  const store = createEmptyStore(series);
  let snapshot: StreamingStoreSnapshot = {
    store,
    revision: store.revision,
  };

  const notify = () => {
    snapshot = {
      store,
      revision: store.revision,
    };
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    getLength: () => store.length,
    reset: (nextPlaces) => {
      resetStore(store, nextPlaces);
      notify();
    },
    resetCurrentSeries: () => {
      resetStore(store, store.series);
      notify();
    },
    appendFrames: (frames, extract) => {
      const cols = store.columns;
      const timeCol = cols[0]!;
      const seriesCount = store.series.length;

      for (const frame of frames) {
        timeCol.push(frame.time);
        for (let s = 0; s < seriesCount; s++) {
          cols[s + 1]!.push(extract(frame, s));
        }
      }

      store.length = timeCol.length;
      store.revision++;
      notify();
    },
  };
}

const UNTYPED_COLOR = "#94a3b8"; // slate-400
/**
 * Hook that streams simulation frames directly into uPlot columnar arrays.
 * Returns the current streaming store snapshot for the active timeline view.
 *
 * Handles three view modes driven by `timelineView`:
 *  - `per-place`: one series per place, values are token counts.
 *  - `per-type`: one series per color type (plus "Untyped" for uncolored
 *    places), values are the sum of token counts across places of that type.
 *  - `metric`: a single series computed by the compiled user metric.
 */
export function useStreamingData(): {
  store: StreamingStore;
  metricError: string | null;
} {
  "use no memo"; // imperative streaming with refs

  const { getFramesInRange, totalFrames } = use(SimulationContext);
  const {
    petriNetDefinition: { places, types, transitions, metrics = [] },
  } = use(SDCPNContext);
  const { timelineView } = use(EditorContext);

  const selectedMetric = useMemo(
    () =>
      timelineView.kind === "metric"
        ? (metrics.find((m) => m.id === timelineView.metricId) ?? null)
        : null,
    [timelineView, metrics],
  );

  // Compile the selected metric. Recompiles only when its code changes.
  const compiledMetric = useMemo<{
    fn: CompiledMetric | null;
    error: string | null;
  }>(() => {
    if (!selectedMetric) {
      return { fn: null, error: null };
    }
    const outcome = compileMetric(selectedMetric);
    if (outcome.ok) {
      return { fn: outcome.fn, error: null };
    }
    return { fn: null, error: outcome.error };
  }, [selectedMetric]);

  // Build the series descriptors + a single extractor for the active view.
  // The store only depends on `seriesConfig`; changing view switches series.
  const seriesConfig: {
    series: TimelineSeriesMeta[];
    extract: SeriesExtractor;
  } = useMemo(() => {
    if (timelineView.kind === "metric") {
      const metric = selectedMetric;
      const fn = compiledMetric.fn;
      if (metric && fn) {
        const series: TimelineSeriesMeta[] = [
          {
            seriesId: metric.id,
            seriesName: metric.name,
            color: DEFAULT_COLORS[0]!,
          },
        ];
        const extract: SeriesExtractor = (frame) => {
          try {
            return fn(buildMetricState(frame, places, types));
          } catch {
            // Runtime error (e.g. NaN) — render as a gap.
            return Number.NaN;
          }
        };
        return { series, extract };
      }
      // Fall through: metric missing or failed to compile. Render nothing
      // for now (the component gates on `metricError` to render an error
      // banner instead of the chart).
      return {
        series: [],
        extract: () => Number.NaN,
      };
    }

    if (timelineView.kind === "per-transition") {
      // One series per transition; value at time t is the delta of an
      // **interpolated** cumulative firing count over the trailing window.
      //
      // The raw `firingCount` is an integer step function, which makes the
      // windowed delta visually spiky. To smooth it, we use the transition's
      // `timeSinceLastFiringMs` and the most recent inter-firing interval
      // to linearly ramp the cumulative from k to k+1 while the transition
      // is between its k-th and expected (k+1)-th firing:
      //
      //   smoothed(t) = firingCount + min(1, tsl / lastInterval)
      //
      // Before a second firing occurs there's no interval estimate yet, so
      // we fall back to the integer cumulative until one is known. The
      // windowed delta is then computed from these floating-point values.
      const PER_TRANSITION_WINDOW_SEC = 4;
      // Exponential low-pass on the output. 0 < α ≤ 1; smaller = smoother
      // (more lag). α ≈ 0.15 gives a ~6–7 frame effective window.
      const OUTPUT_EWMA_ALPHA = 0.15;

      const series: TimelineSeriesMeta[] = transitions.map(
        (transition, index) => ({
          seriesId: `transition__${transition.id}`,
          seriesName: transition.name,
          color: DEFAULT_COLORS[index % DEFAULT_COLORS.length]!,
        }),
      );
      const transitionIds = transitions.map((t) => t.id);

      // Per-series state. Recreated when seriesConfig is recreated
      // (view/transitions change). Simulation restart (time regression) is
      // detected below and clears the buffers in-place.
      const timeHistory: number[] = [];
      const cumulativeHistories: number[][] = transitions.map(() => []);
      const lastFiringTimes: (number | null)[] = transitions.map(() => null);
      const lastIntervals: (number | null)[] = transitions.map(() => null);
      const prevFiringCounts: number[] = transitions.map(() => 0);
      const smoothedOutputs: number[] = transitions.map(() => 0);

      const resetState = () => {
        timeHistory.length = 0;
        for (const history of cumulativeHistories) {
          history.length = 0;
        }
        for (let i = 0; i < transitions.length; i++) {
          lastFiringTimes[i] = null;
          lastIntervals[i] = null;
          prevFiringCounts[i] = 0;
          smoothedOutputs[i] = 0;
        }
      };

      const extract: SeriesExtractor = (frame, seriesIdx) => {
        const id = transitionIds[seriesIdx];
        if (!id) {
          return 0;
        }

        // On the first series of each frame, grow (or reset) the shared
        // time history. A time regression means the simulation restarted.
        if (seriesIdx === 0) {
          const last = timeHistory[timeHistory.length - 1];
          if (last !== undefined && frame.time < last) {
            resetState();
          }
          timeHistory.push(frame.time);
        }

        const transitionState = frame.getTransitionState(id);
        const firingCount = transitionState?.firingCount ?? 0;
        const tslSec = (transitionState?.timeSinceLastFiringMs ?? 0) / 1000;

        // If the firing count increased since the last frame we observed,
        // a firing just occurred — update the last-firing time and, when
        // we already had one, the observed inter-firing interval.
        if (firingCount > prevFiringCounts[seriesIdx]!) {
          const prevFiringTime = lastFiringTimes[seriesIdx] ?? null;
          if (prevFiringTime !== null) {
            const interval = frame.time - prevFiringTime;
            if (interval > 0) {
              lastIntervals[seriesIdx] = interval;
            }
          }
          lastFiringTimes[seriesIdx] = frame.time;
        }
        prevFiringCounts[seriesIdx] = firingCount;

        // Interpolated cumulative: ramp linearly over the last known
        // interval; cap at +1 so we never overshoot the next firing.
        const interval = lastIntervals[seriesIdx] ?? null;
        const interpolated =
          interval !== null && interval > 0
            ? firingCount + Math.min(1, tslSec / interval)
            : firingCount;

        cumulativeHistories[seriesIdx]!.push(interpolated);

        // Find the cumulative value at the first stored time ≤ t − window.
        // If no such entry exists, treat the baseline as 0 (pre-simulation).
        const targetTime = frame.time - PER_TRANSITION_WINDOW_SEC;
        const history = cumulativeHistories[seriesIdx]!;
        let prev = 0;
        // Skip the current-frame entry (just pushed) by starting at length-2.
        for (let i = timeHistory.length - 2; i >= 0; i--) {
          if (timeHistory[i]! <= targetTime) {
            prev = history[i]!;
            break;
          }
        }
        const rawDelta = interpolated - prev;

        // Exponential low-pass on the output to tame the residual
        // stochastic noise in firing intervals. Single MAC per frame.
        const smoothed =
          OUTPUT_EWMA_ALPHA * rawDelta +
          (1 - OUTPUT_EWMA_ALPHA) * smoothedOutputs[seriesIdx]!;
        smoothedOutputs[seriesIdx] = smoothed;
        return smoothed;
      };
      return { series, extract };
    }

    if (timelineView.kind === "per-type") {
      // Group places by color type; places with no colorId become "Untyped".
      const groups: { series: TimelineSeriesMeta; placeIds: string[] }[] = [];
      for (const type of types) {
        const placeIds = places
          .filter((p) => p.colorId === type.id)
          .map((p) => p.id);
        if (placeIds.length === 0) {
          continue;
        }
        groups.push({
          series: {
            seriesId: `type__${type.id}`,
            seriesName: type.name,
            color: type.displayColor || DEFAULT_COLORS[0]!,
          },
          placeIds,
        });
      }
      const untypedIds = places
        .filter((p) => p.colorId === null)
        .map((p) => p.id);
      if (untypedIds.length > 0) {
        groups.push({
          series: {
            seriesId: "type__untyped",
            seriesName: "Untyped",
            color: UNTYPED_COLOR,
          },
          placeIds: untypedIds,
        });
      }
      const groupPlaceIds = groups.map((g) => g.placeIds);
      const extract: SeriesExtractor = (frame, seriesIdx) => {
        const ids = groupPlaceIds[seriesIdx];
        if (!ids) {
          return 0;
        }
        let sum = 0;
        for (const id of ids) {
          sum += frame.getPlaceTokenCount(id);
        }
        return sum;
      };
      return { series: groups.map((g) => g.series), extract };
    }

    // per-place: one series per place
    const series = places.map((place, index) => {
      const tokenType = types.find((type) => type.id === place.colorId);
      return {
        seriesId: place.id,
        seriesName: place.name,
        color:
          tokenType?.displayColor ??
          DEFAULT_COLORS[index % DEFAULT_COLORS.length]!,
      };
    });
    const placeIds = places.map((p) => p.id);
    const extract: SeriesExtractor = (frame, seriesIdx) => {
      const id = placeIds[seriesIdx];
      return id ? frame.getPlaceTokenCount(id) : 0;
    };
    return { series, extract };
  }, [
    timelineView,
    places,
    types,
    transitions,
    selectedMetric,
    compiledMetric.fn,
  ]);

  const storeController = useMemo(() => createStreamingStoreController([]), []);
  const { store } = useSyncExternalStore(
    storeController.subscribe,
    storeController.getSnapshot,
    storeController.getSnapshot,
  );
  const processedRef = useRef(0);

  // Reset store when the series structure changes (view switch or net edits).
  useEffect(() => {
    storeController.reset(seriesConfig.series);
    processedRef.current = 0;
  }, [seriesConfig.series, storeController]);

  // Stream new frames into the store
  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      if (totalFrames === 0) {
        if (storeController.getLength() > 0) {
          storeController.resetCurrentSeries();
          processedRef.current = 0;
        }
        return;
      }

      // Handle simulation restart
      if (totalFrames < processedRef.current) {
        storeController.resetCurrentSeries();
        processedRef.current = 0;
      }

      const startIndex = processedRef.current;
      if (startIndex >= totalFrames) {
        return;
      }

      const newFrames = await getFramesInRange(startIndex);
      if (cancelled || newFrames.length === 0) {
        return;
      }

      storeController.appendFrames(newFrames, seriesConfig.extract);
      processedRef.current = totalFrames;
    };

    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [getFramesInRange, totalFrames, seriesConfig, storeController]);

  return {
    store,
    metricError: compiledMetric.error,
  };
}
