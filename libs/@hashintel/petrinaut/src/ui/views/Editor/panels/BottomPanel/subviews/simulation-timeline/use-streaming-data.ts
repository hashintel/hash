import {
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  createHirMetricEvaluator,
  resolveNetParameterValues,
  sanitizeSDCPNForExtensions,
  type Metric,
} from "@hashintel/petrinaut-core";
import { fingerprintHirCompilationInput } from "@hashintel/petrinaut-core/hir-runtime";

import { useSimulationParameters } from "../../../../../../../react/hooks/use-simulation";
import { LanguageClientContext } from "../../../../../../../react/lsp/context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { buildTimelineSeriesConfig } from "./series-config";

import type { ExecutionFrameSource } from "../../../../../../../react/execution-frame/context";
import type { TimelineMetricEvaluator } from "./series-config/metric";
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

type TimelineMetricState = {
  /** Identity of the compiled metric (id + code), null when none. */
  key: string | null;
  evaluate: TimelineMetricEvaluator | null;
  error: string | null;
};

const EMPTY_TIMELINE_METRIC_STATE: TimelineMetricState = {
  key: null,
  evaluate: null,
  error: null,
};

/**
 * Compiles the selected timeline metric through the HIR (in the language
 * worker) and binds the resulting buffer program to frame readers. The
 * compile is asynchronous — while it is in flight the extractor plots gaps.
 */
function useTimelineMetric(metric: Metric | null): TimelineMetricState {
  const { requestHirArtifacts } = use(LanguageClientContext);
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const { parameterValues } = useSimulationParameters();
  const [state, setState] = useState<TimelineMetricState>(
    EMPTY_TIMELINE_METRIC_STATE,
  );
  // Resolved net parameter values bound to ambient `parameters.<name>` reads
  // in the metric. They can change between runs (including scenario
  // overrides), so they participate in the metric key to rebind the evaluator.
  const netParameterValues = useMemo(
    () =>
      resolveNetParameterValues(
        petriNetDefinition.parameters,
        parameterValues,
        extensions.parameters,
      ),
    [petriNetDefinition.parameters, parameterValues, extensions.parameters],
  );
  const compilationFingerprint = useMemo(
    () =>
      fingerprintHirCompilationInput(
        sanitizeSDCPNForExtensions(petriNetDefinition, extensions),
        extensions,
      ),
    [extensions, petriNetDefinition],
  );
  const key = metric
    ? `${compilationFingerprint}\u0000${metric.id}\u0000${metric.code}\u0000${JSON.stringify(netParameterValues)}`
    : null;

  useEffect(() => {
    if (!metric || !key) {
      return;
    }

    let cancelled = false;
    requestHirArtifacts(
      { ...petriNetDefinition, metrics: [metric] },
      extensions,
    )
      .then(({ artifacts, failures }) => {
        if (cancelled) {
          return;
        }
        const artifact = artifacts.metrics[metric.id];
        if (!artifact) {
          const message = failures
            .filter(
              (failure) =>
                failure.itemType === "metric" && failure.itemId === metric.id,
            )
            .flatMap((failure) =>
              failure.diagnostics.map((diagnostic) => diagnostic.message),
            )
            .join("; ");
          setState({
            key,
            evaluate: null,
            error: message || `Metric "${metric.name}" did not compile`,
          });
          return;
        }
        setState({
          key,
          evaluate: createHirMetricEvaluator({
            metricName: metric.name,
            artifact,
            places: petriNetDefinition.places,
            parameterValues: netParameterValues,
          }),
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            key,
            evaluate: null,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    metric,
    key,
    extensions,
    petriNetDefinition,
    requestHirArtifacts,
    netParameterValues,
  ]);

  // Effects run after render. Hide a previous evaluator/error synchronously
  // whenever the metric, schema, code, or extension settings change.
  return state.key === key ? state : EMPTY_TIMELINE_METRIC_STATE;
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
export function useStreamingData(source: ExecutionFrameSource): {
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

  const timelineMetric = useTimelineMetric(selectedMetric);
  const evaluateMetric = timelineMetric.evaluate;
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
    evaluateMetric,
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
      processedRef.current = startIndex + newFrames.length;
    };

    void fetchData();
    return () => {
      cancelled = true;
    };
    // sourceId is depended on so a source-identity change always restarts
    // frame reads after the reset effect above cleared the store.
  }, [getFramesInRange, seriesConfig, sourceId, storeController, totalFrames]);

  return {
    store,
    metricError: timelineMetric.error,
  };
}
