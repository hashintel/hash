import { use, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  buildMetricState,
  type MetricEvaluator,
} from "@hashintel/petrinaut-core";

import { useEvalSandbox } from "../../../../../../../react/eval-sandbox/context";
import { SimulationContext } from "../../../../../../../react/simulation/context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { buildTimelineSeriesConfig } from "./series-config";

import type {
  StreamingStore,
  TimelineFrame,
  TimelineSeriesExtractor,
  TimelineSeriesMeta,
} from "./types";

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

interface StreamingStoreController {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => StreamingStoreSnapshot;
  getLength: () => number;
  reset: (series: TimelineSeriesMeta[]) => void;
  resetCurrentSeries: () => void;
  appendFrames: (
    frames: TimelineFrame[],
    extract: TimelineSeriesExtractor,
    /**
     * Optional pre-computed values for series 0. Used by the metric
     * view, where the actual evaluation has already happened via the
     * sandbox's {@link MetricEvaluator}. When set, the extractor is
     * bypassed for series index 0 and `metricColumn[i]` is appended
     * instead. There is always exactly one series in this mode.
     */
    metricColumn?: number[],
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
    appendFrames: (frames, extract, metricColumn) => {
      const cols = store.columns;
      const timeCol = cols[0]!;
      const seriesCount = store.series.length;

      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i]!;
        const time = frame.time;
        timeCol.push(time);
        if (metricColumn) {
          // Metric view: exactly one series, value already evaluated.
          cols[1]!.push(metricColumn[i] ?? Number.NaN);
        } else {
          for (let s = 0; s < seriesCount; s++) {
            cols[s + 1]!.push(extract(frame, s, time));
          }
        }
      }

      store.length = timeCol.length;
      store.revision++;
      notify();
    },
  };
}

/**
 * Hook that streams simulation frames directly into uPlot columnar arrays.
 *
 * uPlot data is columnar: the first array contains x-values, then each
 * following array contains y-values for one plotted series.
 * See: https://github.com/leeoniya/uPlot/blob/master/docs/README.md#data-format
 *
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
  const { dt, getFramesInRange, totalFrames } = use(SimulationContext);
  const {
    petriNetDefinition: { places, types, transitions, metrics },
  } = use(SDCPNContext);
  const { timelineView } = use(EditorContext);
  const evalSandbox = useEvalSandbox();

  const selectedMetric =
    timelineView.kind === "metric"
      ? (metrics?.find((metric) => metric.id === timelineView.metricId) ?? null)
      : null;

  // Build / dispose the metric evaluator off the EvalSandbox whenever
  // the selected metric changes. The evaluator may live inside an
  // iframe sandbox — calls into it are async.
  const [metricEvaluator, setMetricEvaluator] =
    useState<MetricEvaluator | null>(null);
  const [metricError, setMetricError] = useState<string | null>(null);

  useEffect(() => {
    const tracker = { cancelled: false };
    let evaluator: MetricEvaluator | null = null;
    if (!selectedMetric) {
      // Defer the clear to the next microtask so the setState is not
      // synchronous-in-effect.
      void Promise.resolve().then(() => {
        if (tracker.cancelled) {
          return;
        }
        setMetricEvaluator(null);
        setMetricError(null);
      });
    } else {
      evalSandbox
        .createMetricEvaluator(selectedMetric)
        .then((built) => {
          if (tracker.cancelled) {
            built.dispose();
            return;
          }
          evaluator = built;
          setMetricEvaluator(built);
          setMetricError(null);
        })
        .catch((err: unknown) => {
          if (tracker.cancelled) {
            return;
          }
          setMetricEvaluator(null);
          setMetricError(err instanceof Error ? err.message : String(err));
        });
    }
    return () => {
      tracker.cancelled = true;
      evaluator?.dispose();
    };
  }, [evalSandbox, selectedMetric]);

  // Computes the active timeline view mode described above into concrete uPlot
  // series metadata and the per-frame value extractor used while streaming.
  const seriesConfig = buildTimelineSeriesConfig({
    timelineView,
    places,
    types,
    transitions,
    selectedMetric,
    metricReady: metricEvaluator !== null,
  });

  const storeController = createStreamingStoreController([]);
  const { store } = useSyncExternalStore(
    storeController.subscribe,
    storeController.getSnapshot,
    storeController.getSnapshot,
  );

  // Imperative cursor for streaming: this is the next frame index that has not
  // yet been appended to the uPlot columns. Updating it should not re-render.
  const processedRef = useRef(0);

  // Reset store when the series structure or x-axis timing changes.
  useEffect(() => {
    storeController.reset(seriesConfig.series);
    processedRef.current = 0;
  }, [dt, seriesConfig.series, storeController]);

  // Stream new frames into the store
  useEffect(() => {
    // Tracker object: oxlint's narrow-flow analysis follows primitive
    // `let cancelled = false` through awaits and reports later
    // `if (cancelled)` checks as unreachable. Boxing in an object opts
    // out of that analysis (the property is mutated by the cleanup
    // function in a sibling closure).
    const tracker = { cancelled: false };
    const isCancelled = () => tracker.cancelled;

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
      if (isCancelled() || newFrames.length === 0) {
        return;
      }

      let metricColumn: number[] | undefined;
      if (timelineView.kind === "metric" && metricEvaluator) {
        const states = newFrames.map((frame) =>
          buildMetricState(frame, places, types),
        );
        try {
          const results = await metricEvaluator.evaluateBatch(states);
          if (isCancelled()) {
            return;
          }
          metricColumn = results.map((result) =>
            typeof result === "number" ? result : Number.NaN,
          );
        } catch (err) {
          if (isCancelled()) {
            return;
          }
          setMetricError(err instanceof Error ? err.message : String(err));
          metricColumn = states.map(() => Number.NaN);
        }
      }

      storeController.appendFrames(
        newFrames,
        seriesConfig.extract,
        metricColumn,
      );
      processedRef.current = totalFrames;
    };

    void fetchData();
    return () => {
      tracker.cancelled = true;
    };
  }, [
    dt,
    getFramesInRange,
    totalFrames,
    seriesConfig,
    storeController,
    metricEvaluator,
    places,
    types,
    timelineView.kind,
  ]);

  return {
    store,
    metricError,
  };
}
