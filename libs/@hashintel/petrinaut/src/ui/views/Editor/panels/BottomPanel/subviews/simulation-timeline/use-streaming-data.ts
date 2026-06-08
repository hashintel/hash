import { use, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  compileMetric,
  type CompiledMetric,
  type Metric,
} from "@hashintel/petrinaut-core";

import { EditorContext } from "../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { buildTimelineSeriesConfig } from "./series-config";

import type {
  StreamingStore,
  TimelineFrame,
  TimelineFrameSource,
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
export function useStreamingData(source: TimelineFrameSource): {
  store: StreamingStore;
  metricError: string | null;
} {
  const {
    extensions,
    petriNetDefinition: { places, types, transitions, metrics },
  } = use(SDCPNContext);
  const colorsEnabled = extensions.colors;
  const { timelineView } = use(EditorContext);

  const selectedMetric =
    timelineView.kind === "metric"
      ? (metrics?.find((metric) => metric.id === timelineView.metricId) ?? null)
      : null;

  const compiledMetric = compileTimelineMetric(selectedMetric);
  const availableTypes = colorsEnabled ? types : [];
  const availablePlaces = colorsEnabled
    ? places
    : places.map((place) => ({ ...place, colorId: null }));

  // Computes the active timeline view mode described above into concrete uPlot
  // series metadata and the per-frame value extractor used while streaming.
  const seriesConfig = buildTimelineSeriesConfig({
    timelineView,
    places: availablePlaces,
    types: availableTypes,
    transitions,
    selectedMetric,
    compiledMetric: compiledMetric.fn,
  });

  const [storeController] = useState(() => createStreamingStoreController([]));
  const { store } = useSyncExternalStore(
    storeController.subscribe,
    storeController.getSnapshot,
    storeController.getSnapshot,
  );

  // Imperative cursor for streaming: this is the next frame index that has not
  // yet been appended to the uPlot columns. Updating it should not re-render.
  const processedRef = useRef(0);

  // Reset store when the source identity or series structure changes.
  useEffect(() => {
    storeController.reset(seriesConfig.series);
    processedRef.current = 0;
  }, [seriesConfig.series, source.sourceId, storeController]);

  // Stream new frames into the store
  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      if (source.totalFrames === 0) {
        if (storeController.getLength() > 0) {
          storeController.resetCurrentSeries();
          processedRef.current = 0;
        }
        return;
      }

      // Handle simulation restart
      if (source.totalFrames < processedRef.current) {
        storeController.resetCurrentSeries();
        processedRef.current = 0;
      }

      const startIndex = processedRef.current;
      if (startIndex >= source.totalFrames) {
        return;
      }

      const newFrames = await source.getFramesInRange(startIndex);
      if (cancelled || newFrames.length === 0) {
        return;
      }

      storeController.appendFrames(newFrames, seriesConfig.extract);
      processedRef.current = startIndex + newFrames.length;
    };

    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [seriesConfig, source, storeController]);

  return {
    store,
    metricError: compiledMetric.error,
  };
}
