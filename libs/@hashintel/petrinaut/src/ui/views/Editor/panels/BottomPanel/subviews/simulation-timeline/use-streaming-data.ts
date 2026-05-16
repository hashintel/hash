import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { use, useEffect, useRef, useSyncExternalStore } from "react";
import {
  type CompiledMetric,
  compileMetric,
} from "../../../../../../../core/simulation/authoring/metric/compile-metric";
import type { Metric } from "../../../../../../../core/types/sdcpn";
import { SimulationContext } from "../../../../../../../react/simulation/context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
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
        const time = frame.time;
        timeCol.push(time);
        for (let s = 0; s < seriesCount; s++) {
          cols[s + 1]!.push(extract(frame, s, time));
        }
      }

      store.length = timeCol.length;
      store.revision++;
      notify();
    },
  };
}

function compileTimelineMetric(metric: Metric | null): {
  fn: CompiledMetric | null;
  error: string | null;
} {
  if (!metric) {
    return { fn: null, error: null };
  }

  const outcome = compileMetric(metric);
  if (outcome.ok) {
    return { fn: outcome.fn, error: null };
  }
  return { fn: null, error: outcome.error };
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

  const selectedMetric =
    timelineView.kind === "metric"
      ? (metrics?.find((metric) => metric.id === timelineView.metricId) ?? null)
      : null;

  const compiledMetric = compileTimelineMetric(selectedMetric);

  // Computes the active timeline view mode described above into concrete uPlot
  // series metadata and the per-frame value extractor used while streaming.
  const seriesConfig = buildTimelineSeriesConfig({
    timelineView,
    places,
    types,
    transitions,
    selectedMetric,
    compiledMetric: compiledMetric.fn,
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
  }, [dt, getFramesInRange, totalFrames, seriesConfig, storeController]);

  return {
    store,
    metricError: compiledMetric.error,
  };
}
