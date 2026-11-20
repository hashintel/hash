import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { usePetrinautDefinitionSelector } from "../../../../../../../react/hooks/use-document";
import { useSDCPNState } from "../../../../../../../react/state/sdcpn-context";
import { buildTimelineSeriesConfig } from "./series-config";

import type { ExecutionFrameSource } from "../../../../../../../react/execution-frame/context";
import type { SimulationFrameReader } from "../../../../../../../react/simulation/context";
import type { TimelineView } from "../../../../../../../react/state/editor-context";
import type {
  StreamingStore,
  TimelineSeriesExtractor,
  TimelineSeriesMeta,
} from "./types";

function createEmptyStore(): StreamingStore {
  return {
    series: [],
    columns: [[]],
    length: 0,
  };
}

function resetStore(store: StreamingStore, series: TimelineSeriesMeta[]): void {
  Object.assign(store, {
    series,
    columns: [[], ...series.map(() => [])],
    length: 0,
  });
}

interface StreamingStoreSnapshot {
  store: StreamingStore;
}

interface StreamingStoreController {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => StreamingStoreSnapshot;
  getLength: () => number;
  reset: (series: TimelineSeriesMeta[]) => void;
  resetCurrentSeries: () => void;
  appendFrames: (
    frames: SimulationFrameReader[],
    extract: TimelineSeriesExtractor,
  ) => void;
}

function createStreamingStoreController(): StreamingStoreController {
  const listeners = new Set<() => void>();
  const store = createEmptyStore();
  let snapshot: StreamingStoreSnapshot = { store };

  const notify = () => {
    snapshot = { store };
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
      notify();
    },
  };
}

/**
 * Reads the frames of a reported execution into uPlot's columnar arrays as
 * they arrive, for the series `timelineView` draws.
 *
 * uPlot data is columnar: the first array contains x-values, then each
 * following array contains y-values for one plotted series.
 * See: https://github.com/leeoniya/uPlot/blob/master/docs/README.md#data-format
 *
 * A reported execution carries token counts only, so the view is one of
 * tokens per place, tokens per type and transition firings.
 *
 * While `paused` no frame is read. The cursor is kept, so resuming appends
 * everything that arrived meanwhile in one batch.
 */
export function useStreamingData(
  source: ExecutionFrameSource,
  timelineView: TimelineView,
  paused: boolean,
): StreamingStore {
  const colorsEnabled = useSDCPNState((document) => document.extensions.colors);
  const places = usePetrinautDefinitionSelector((net) => net.places);
  const types = usePetrinautDefinitionSelector((net) => net.types);
  const transitions = usePetrinautDefinitionSelector((net) => net.transitions);
  const availableTypes = colorsEnabled ? types : [];
  const availablePlaces = colorsEnabled
    ? places
    : places.map((place) => ({ ...place, colorId: null }));

  // The series of the view and the extractor that reads a frame's value for
  // each of them.
  const seriesConfig = buildTimelineSeriesConfig({
    timelineView,
    places: availablePlaces,
    types: availableTypes,
    transitions,
    selectedMetric: null,
    evaluateMetric: null,
  });

  const [storeController] = useState(createStreamingStoreController);
  const { store } = useSyncExternalStore(
    storeController.subscribe,
    storeController.getSnapshot,
    storeController.getSnapshot,
  );

  // Imperative cursor for streaming: this is the next frame index that has not
  // yet been appended to the uPlot columns. Updating it should not re-render.
  const processedRef = useRef(0);

  // The frame-related fields are depended on individually below so that
  // changes to unrelated source fields (e.g. the viewed frame index moving
  // during playback or scrubbing) do not restart frame reads.
  const { getFramesInRange, sourceId, totalFrames } = source;

  // Reset store when the source identity or series structure changes.
  useEffect(() => {
    storeController.reset(seriesConfig.series);
    processedRef.current = 0;
  }, [seriesConfig.series, sourceId, storeController]);

  // Stream new frames into the store.
  useEffect(() => {
    // A reset is noticed while paused too, so resuming does not append a new
    // run to the old one's rows.
    if (totalFrames === 0) {
      if (storeController.getLength() > 0) {
        storeController.resetCurrentSeries();
        processedRef.current = 0;
      }
      return;
    }
    if (totalFrames < processedRef.current) {
      storeController.resetCurrentSeries();
      processedRef.current = 0;
    }
    if (paused) {
      return;
    }

    let cancelled = false;

    const fetchData = async () => {
      const startIndex = processedRef.current;
      if (startIndex >= totalFrames) {
        return;
      }

      const newFrames = await getFramesInRange(startIndex);
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
    // sourceId is depended on so a source-identity change always restarts
    // frame reads after the reset effect above cleared the store.
  }, [
    getFramesInRange,
    paused,
    seriesConfig,
    sourceId,
    storeController,
    totalFrames,
  ]);

  return store;
}
