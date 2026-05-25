# Monte Carlo Metrics Proposal

## Goal

Support multiple metric shapes without adding one-off API fields for each new
metric. The design should cover:

- distributions per frame, like place token count histograms
- scalar aggregations per frame, like average token count
- scalar series over time, like transition throughput
- future table/vector outputs for richer UI views

The main constraint is the worker boundary. Runtime metric implementations can
hold functions and mutable accumulator state, but `createMonteCarloExperiment`
can only send serializable metric configuration to a worker.

## Existing Tools

Prometheus and OpenTelemetry already provide useful metric vocabulary:

- gauge: a value at a point in time
- sum/counter: an accumulated value
- histogram: bucketed observations
- summary: precomputed quantiles or summary statistics

They are good references for naming and output shapes, but they are not a
drop-in model here. Monte Carlo metrics are simulation-frame observations, not
process telemetry scraped from a service. The proposal below borrows the
concepts while keeping the API specific to simulation frames and worker
streaming.

Vega-Lite is useful downstream if metric output can be represented as rows. The
metric layer should therefore expose serializable points/tables rather than UI
component-specific structures.

## Recommended Shape

Split metrics into four pieces:

1. **Metric spec**: serializable user config.
2. **Metric descriptor**: stable metadata for UI and storage.
3. **Metric accumulator**: runtime stateful implementation.
4. **Metric emission**: serializable output streamed from worker to main thread.

```ts
export type MonteCarloMetricId = string;

export type MonteCarloMetricDescriptor = {
  id: MonteCarloMetricId;
  title: string;
  description?: string;
  unit?: string;
  valueKind: "scalar" | "histogram" | "vector" | "table";
  temporalKind: "perFrame" | "cumulative" | "windowed" | "final";
};
```

`valueKind` describes the shape of each emitted value. `temporalKind` describes
how to interpret it over time.

## Serializable Specs

Specs are what `createMonteCarloExperiment()` can send to a worker. They should
be discriminated unions with enough detail for the worker to construct known
accumulators.

```ts
export type MonteCarloMetricSpec =
  | PlaceTokenHistogramMetricSpec
  | AveragePlaceTokenCountMetricSpec
  | TransitionThroughputMetricSpec;

export type RunSampleMode = "active" | "completed" | "all";

export type PlaceTokenHistogramMetricSpec = {
  type: "placeTokenHistogram";
  id: MonteCarloMetricId;
  title?: string;
  placeIds?: readonly string[];
  sampleRuns?: RunSampleMode;
};

export type AveragePlaceTokenCountMetricSpec = {
  type: "averagePlaceTokenCount";
  id: MonteCarloMetricId;
  title?: string;
  placeIds?: readonly string[];
  sampleRuns?: RunSampleMode;
};

export type TransitionThroughputMetricSpec = {
  type: "transitionThroughput";
  id: MonteCarloMetricId;
  title?: string;
  transitionIds?: readonly string[];
  groupBy?: "transition" | "all";
  windowFrames?: number;
};
```

The direct simulator can still accept runtime metric objects for advanced use,
but the experiment API should accept specs:

```ts
export type MonteCarloSimulatorConfig = {
  // existing fields...
  metricSpecs?: readonly MonteCarloMetricSpec[];
  metrics?: readonly MonteCarloMetricAccumulator[];
};

export type CreateMonteCarloExperimentConfig = {
  // existing fields...
  metrics?: readonly MonteCarloMetricSpec[];
};
```

## Runtime Accumulators

Accumulators are stateful and not serializable. They observe frame context,
update internal state, and emit serializable metric frames.

```ts
export type MonteCarloMetricObserveContext = {
  frameNumber: number;
  time: number;
  runCount: number;
  activeRunCount: number;
  completedRunCount: number;
  erroredRunCount: number;
  placeIds: readonly string[];
  placeNames: readonly string[];
  transitionIds: readonly string[];
  transitionNames: readonly string[];

  forEachRun(visitor: MonteCarloRunMetricVisitor): void;
};

export type MonteCarloRunMetricVisitor = (run: MonteCarloRunMetricView) => void;

export type MonteCarloRunMetricView = {
  runIndex: number;
  status: MonteCarloRunStatus;
  placeTokenCounts: Uint32Array;
  transitionFiringCounts: Uint32Array;
  transitionFiredFlags: Uint8Array;
};

export type MonteCarloMetricAccumulator = {
  readonly descriptor: MonteCarloMetricDescriptor;

  observeFrame(context: MonteCarloMetricObserveContext): void;

  /**
   * Returns only newly produced emissions since the last drain.
   *
   * This lets workers stream increments without retaining duplicate outbound
   * state. Implementations may still keep their own rolling or full history.
   */
  drain(): MonteCarloMetricEmission[];

  getSnapshot(): MonteCarloMetricSnapshot;
  reset(): void;
};
```

The key change from the current API is that an accumulator is responsible for
its own incremental output via `drain()`. The worker should not inspect
metric-specific `frames` arrays.

Common run sampling should be centralized so each metric uses the same meaning
for "active", "completed", and "all".

```ts
export function shouldSampleRun(
  mode: RunSampleMode | undefined,
  status: MonteCarloRunStatus,
): boolean {
  switch (mode ?? "active") {
    case "active":
      return status !== "complete" && status !== "error";
    case "completed":
      return status === "complete";
    case "all":
      return true;
  }
}
```

## Output Schema

All metric output should flow through one generic message shape.

```ts
export type MonteCarloMetricEmission = {
  metricId: MonteCarloMetricId;
  frameNumber: number;
  time: number;
  value: MonteCarloMetricValue;
};

export type MonteCarloMetricSnapshot = {
  metricId: MonteCarloMetricId;
  descriptor: MonteCarloMetricDescriptor;
  latest: MonteCarloMetricEmission | null;
};

export type MonteCarloMetricValue =
  | MonteCarloScalarMetricValue
  | MonteCarloHistogramMetricValue
  | MonteCarloVectorMetricValue
  | MonteCarloTableMetricValue;

export type MonteCarloScalarMetricValue = {
  kind: "scalar";
  value: number;
  sampleCount?: number;
};

export type MonteCarloHistogramMetricValue = {
  kind: "histogram";
  series: readonly {
    entityId: string;
    label: string;
    sampleCount: number;
    bins: readonly [bucket: number, frequency: number][];
  }[];
};

export type MonteCarloVectorMetricValue = {
  kind: "vector";
  values: readonly {
    entityId: string;
    label: string;
    value: number;
    sampleCount?: number;
  }[];
};

export type MonteCarloTableMetricValue = {
  kind: "table";
  columns: readonly {
    key: string;
    label: string;
    valueType: "string" | "number" | "boolean";
  }[];
  rows: readonly Record<string, string | number | boolean>[];
};
```

This keeps the transport generic:

```ts
export type MonteCarloMetricEmissionsMessage = {
  type: "metricEmissions";
  emissions: readonly MonteCarloMetricEmission[];
};
```

And the experiment handle can expose one generic metric store:

```ts
export type MonteCarloExperimentMetrics = {
  descriptors: readonly MonteCarloMetricDescriptor[];
  latestByMetricId: ReadonlyMap<MonteCarloMetricId, MonteCarloMetricEmission>;
  framesByMetricId: ReadonlyMap<
    MonteCarloMetricId,
    readonly MonteCarloMetricEmission[]
  >;
};

export interface MonteCarloExperiment {
  // existing fields...
  readonly metrics: ReadableStore<MonteCarloExperimentMetrics>;
}
```

## Example: Distribution Per Frame

This is the generalized form of the current place token count distribution.

```ts
export function createPlaceTokenHistogramMetric(
  spec: PlaceTokenHistogramMetricSpec,
): MonteCarloMetricAccumulator {
  const descriptor: MonteCarloMetricDescriptor = {
    id: spec.id,
    title: spec.title ?? "Place token count distribution",
    valueKind: "histogram",
    temporalKind: "perFrame",
  };
  const pending: MonteCarloMetricEmission[] = [];
  let latest: MonteCarloMetricEmission | null = null;

  return {
    descriptor,
    observeFrame(context) {
      const selectedPlaceIds = new Set(spec.placeIds ?? context.placeIds);
      const histograms = context.placeIds.map(() => new Map<number, number>());
      let sampleCount = 0;

      context.forEachRun((run) => {
        if (!shouldSampleRun(spec.sampleRuns, run.status)) {
          return;
        }

        sampleCount++;
        for (let index = 0; index < context.placeIds.length; index++) {
          const placeId = context.placeIds[index]!;
          if (!selectedPlaceIds.has(placeId)) {
            continue;
          }

          const count = run.placeTokenCounts[index] ?? 0;
          const histogram = histograms[index]!;
          histogram.set(count, (histogram.get(count) ?? 0) + 1);
        }
      });

      latest = {
        metricId: spec.id,
        frameNumber: context.frameNumber,
        time: context.time,
        value: {
          kind: "histogram",
          series: context.placeIds
            .map((placeId, index) => ({
              entityId: placeId,
              label: context.placeNames[index] ?? placeId,
              sampleCount,
              bins: [...histograms[index]!.entries()].sort(
                ([left], [right]) => left - right,
              ),
            }))
            .filter((entry) => selectedPlaceIds.has(entry.entityId)),
        },
      };
      pending.push(latest);
    },
    drain() {
      return pending.splice(0);
    },
    getSnapshot() {
      return { metricId: spec.id, descriptor, latest };
    },
    reset() {
      pending.length = 0;
      latest = null;
    },
  };
}
```

## Example: Average Per Frame

This emits one vector value per frame, with one average per place.

```ts
export function createAveragePlaceTokenCountMetric(
  spec: AveragePlaceTokenCountMetricSpec,
): MonteCarloMetricAccumulator {
  const descriptor: MonteCarloMetricDescriptor = {
    id: spec.id,
    title: spec.title ?? "Average place token count",
    valueKind: "vector",
    temporalKind: "perFrame",
  };
  const pending: MonteCarloMetricEmission[] = [];
  let latest: MonteCarloMetricEmission | null = null;

  return {
    descriptor,
    observeFrame(context) {
      const selectedPlaceIds = new Set(spec.placeIds ?? context.placeIds);
      const sums = new Float64Array(context.placeIds.length);
      let sampleCount = 0;

      context.forEachRun((run) => {
        if (!shouldSampleRun(spec.sampleRuns, run.status)) {
          return;
        }

        sampleCount++;
        for (let index = 0; index < context.placeIds.length; index++) {
          sums[index] += run.placeTokenCounts[index] ?? 0;
        }
      });

      latest = {
        metricId: spec.id,
        frameNumber: context.frameNumber,
        time: context.time,
        value: {
          kind: "vector",
          values: context.placeIds
            .map((placeId, index) => ({
              entityId: placeId,
              label: context.placeNames[index] ?? placeId,
              value: sampleCount === 0 ? 0 : sums[index]! / sampleCount,
              sampleCount,
            }))
            .filter((entry) => selectedPlaceIds.has(entry.entityId)),
        },
      };
      pending.push(latest);
    },
    drain() {
      return pending.splice(0);
    },
    getSnapshot() {
      return { metricId: spec.id, descriptor, latest };
    },
    reset() {
      pending.length = 0;
      latest = null;
    },
  };
}
```

## Example: Throughput Over Time

This emits a scalar or vector time series. The value is the average transition
firings per unit of simulation time over a rolling frame window.

```ts
export function createTransitionThroughputMetric(
  spec: TransitionThroughputMetricSpec,
): MonteCarloMetricAccumulator {
  const descriptor: MonteCarloMetricDescriptor = {
    id: spec.id,
    title: spec.title ?? "Transition throughput",
    unit: "firings/time",
    valueKind: spec.groupBy === "all" ? "scalar" : "vector",
    temporalKind: spec.windowFrames ? "windowed" : "cumulative",
  };
  const pending: MonteCarloMetricEmission[] = [];
  const history: {
    frameNumber: number;
    time: number;
    totals: Float64Array;
  }[] = [];
  let latest: MonteCarloMetricEmission | null = null;

  return {
    descriptor,
    observeFrame(context) {
      const selectedTransitionIds = new Set(
        spec.transitionIds ?? context.transitionIds,
      );
      const totals = new Float64Array(context.transitionIds.length);

      context.forEachRun((run) => {
        for (let index = 0; index < context.transitionIds.length; index++) {
          totals[index] += run.transitionFiringCounts[index] ?? 0;
        }
      });

      history.push({
        frameNumber: context.frameNumber,
        time: context.time,
        totals,
      });

      const windowFrames = spec.windowFrames ?? context.frameNumber;
      const baseline =
        history.findLast(
          (entry) => entry.frameNumber <= context.frameNumber - windowFrames,
        ) ?? history[0]!;
      const elapsed = Math.max(context.time - baseline.time, 0);

      const values = context.transitionIds
        .map((transitionId, index) => {
          const delta = totals[index]! - baseline.totals[index]!;

          return {
            entityId: transitionId,
            label: context.transitionNames[index] ?? transitionId,
            value: elapsed === 0 ? 0 : delta / elapsed,
            sampleCount: context.runCount,
          };
        })
        .filter((entry) => selectedTransitionIds.has(entry.entityId));

      latest = {
        metricId: spec.id,
        frameNumber: context.frameNumber,
        time: context.time,
        value:
          spec.groupBy === "all"
            ? {
                kind: "scalar",
                value: values.reduce((sum, entry) => sum + entry.value, 0),
                sampleCount: context.runCount,
              }
            : {
                kind: "vector",
                values,
              },
      };
      pending.push(latest);
    },
    drain() {
      return pending.splice(0);
    },
    getSnapshot() {
      return { metricId: spec.id, descriptor, latest };
    },
    reset() {
      pending.length = 0;
      history.length = 0;
      latest = null;
    },
  };
}
```

## Registry

A registry maps serializable specs to runtime accumulators. This is the bridge
between the experiment API and the worker.

```ts
export type MonteCarloMetricFactory<TSpec extends MonteCarloMetricSpec> = (
  spec: TSpec,
) => MonteCarloMetricAccumulator;

export type MonteCarloMetricRegistry = {
  placeTokenHistogram: MonteCarloMetricFactory<PlaceTokenHistogramMetricSpec>;
  averagePlaceTokenCount: MonteCarloMetricFactory<AveragePlaceTokenCountMetricSpec>;
  transitionThroughput: MonteCarloMetricFactory<TransitionThroughputMetricSpec>;
};

export function createMetricAccumulator(
  registry: MonteCarloMetricRegistry,
  spec: MonteCarloMetricSpec,
): MonteCarloMetricAccumulator {
  return registry[spec.type](spec as never);
}
```

For the bundled worker, this registry would contain only built-in metrics. The
direct simulator could additionally accept custom `MonteCarloMetricAccumulator`
objects because it does not cross a serialization boundary.

## Migration Path

1. Add `MonteCarloMetricSpec`, `MonteCarloMetricAccumulator`, and generic
   emission types next to the current metric types.
2. Adapt the existing distribution metric to implement `drain()` and emit
   `MonteCarloMetricEmission`.
3. Change worker messages from metric-specific frame streams to generic
   `metricEmissions`.
4. Add `metrics` to `CreateMonteCarloExperimentConfig` as serializable specs.
5. Expose metric results through one generic metric store.
6. Add built-in average token count and transition throughput metrics.

## Open Questions

- Should completed runs contribute to metrics by default? Current behavior is
  active-only, but that can bias later frames.
- Should accumulators keep full history, rolling history, or no history? The
  `drain()` API allows all three, but UI expectations need to be clear.
- Should metric values support units and display hints, or should that stay in
  the UI layer?
- Do we need custom user-authored metrics in workers? If yes, they likely need a
  compile step or registry at worker-bundle creation time, not callback passing
  through `postMessage`.

## References

- OpenTelemetry Metrics Data Model:
  https://opentelemetry.io/docs/specs/otel/metrics/data-model/
- Prometheus Metric Types:
  https://prometheus.io/docs/concepts/metric_types/
- Prometheus Histograms and Summaries:
  https://prometheus.io/docs/practices/histograms/
- Vega-Lite View Specification:
  https://vega.github.io/vega-lite/docs/spec.html
