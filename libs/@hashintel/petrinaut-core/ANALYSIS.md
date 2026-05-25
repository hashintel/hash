# Monte Carlo Metrics Analysis

## Summary

The current Monte Carlo metric work is useful as an implementation spike, but it
should not become the persisted metric model yet.

There are two separate concepts in the codebase today:

1. `SDCPN.metrics`: persisted author-authored code in the file format. It is a
   single-number metric over a normal simulation frame.
2. Monte Carlo runtime metrics: in-memory objects passed to
   `createMonteCarloSimulator()` or user-defined metric configs passed to the
   local `createMonteCarloExperiment()` path.

Those two concepts should be separated. For now, metrics should be part of a
Monte Carlo run configuration and result stream, not part of the SDCPN model or
file persistence.

Recommended direction:

- Keep runtime Monte Carlo metrics.
- Remove or hide persisted `SDCPN.metrics` until the metric schema is final.
- Add only a small set of built-in Monte Carlo metrics now.
- Emit generic metric values, not visualization-specific structures.
- Let visualizations be a presentation layer over metric output.

## What Exists Today

### Persisted SDCPN Metrics

`Metric` is part of `SDCPN` in `src/types/sdcpn.ts`:

```ts
export type Metric = {
  id: ID;
  name: string;
  description?: string;
  code: string;
};
```

The schema in `src/schemas/metric-schema.ts` describes it as:

- a simulation metric,
- plotted over time,
- implemented as JavaScript code,
- returning exactly one number.

It is currently included in:

- `src/file-format/types.ts` via `metrics: z.array(metricSchema).default([])`
- `src/actions.ts` via `addMetric`, `updateMetric`, and `removeMetric`
- `src/action-schemas.ts` for AI/tool mutation actions
- examples, e.g. the SIR model includes `metric__infected_fraction`
- `serializeSDCPN()`, because it serializes the entire SDCPN payload

This means the current metric shape is already part of persistence.

### Monte Carlo Runtime Metrics

Monte Carlo has a different metric interface:

```ts
export type MonteCarloFrameMetric = {
  observeFrame: (context: MonteCarloFrameMetricContext) => void;
};
```

The context can expose:

- run counts,
- current frame number and time,
- active-run place count arrays,
- every run's current frame reader.

Current implementations:

- `createPlaceTokenCountDistributionMetric()`
  - emits active-run token-count histograms per place per frame.
- `createMonteCarloUserDefinedMetric()`
  - computes one scalar sample per run,
  - aggregates over runs,
  - optionally aggregates over time.

`createMonteCarloSimulator()` can accept runtime metric objects directly.

`createMonteCarloExperiment()` currently has two paths:

- worker-backed path: only streams place token count distributions.
- local path: used when `metrics` configs are passed, because JS callbacks
  cannot be posted to a worker.

That split is pragmatic but not a final model.

## Extensibility Assessment

### What Is Good

The runtime metric direction is extensible in the right place:

- metrics observe simulation frames without owning simulation execution,
- metrics can hold accumulator state,
- metrics can be added without changing the simulator loop too much,
- `FrameReader` gives user-defined metrics a stable API rather than exposing
  internal frame buffers.

The current user-defined metric config already covers useful scalar cases:

- average across runs for a frame,
- sum/min/max/last across runs,
- average/sum/min/max/last across time,
- active/completed/all run sampling.

This is enough for many simple metric lines.

### What Is Not Extensible Enough

The output model is not generic enough.

Right now each metric type owns its own frame array:

- distributions use `PlaceTokenCountDistributionFrame[]`,
- user-defined scalar metrics use `MonteCarloUserDefinedMetricFrame[]`,
- experiment state has separate `distributions` and `metrics` stores.

That makes every new metric shape force new API surface. If later we add branch
predicate counts, heatmaps, quantiles, multi-series metrics, transition
throughput tables, or token attribute distributions, we either add more stores
or overload the existing ones.

A more extensible model would have one metric stream:

```ts
type MetricEmission = {
  metricId: string;
  frameNumber: number;
  time: number;
  value: MetricValue;
};

type MetricValue =
  | { kind: "scalar"; value: number | null; unit?: string }
  | { kind: "histogram"; bins: readonly HistogramBin[]; sampleCount: number }
  | { kind: "series"; points: readonly MetricSeriesPoint[] }
  | {
      kind: "table";
      columns: readonly MetricColumn[];
      rows: readonly unknown[][];
    };
```

Then the UI can choose a visualization from the value shape and descriptor.

The metric descriptor can carry hints, but should not hard-code a UI:

```ts
type MetricDescriptor = {
  id: string;
  label: string;
  description?: string;
  valueKind: MetricValue["kind"];
  defaultVisualization?: "line" | "bar" | "histogram" | "table" | "sparkline";
  unit?: string;
};
```

This gives enough structure for future visualizations without putting chart
configuration into the core file format.

## Predicates And Branches

There is no first-class "branch" entity in core today.

Branching/routing is modeled with multiple transitions consuming from the same
place, usually with complementary predicate lambdas. This is documented in
`libs/@hashintel/petrinaut/docs/useful-patterns.md` under "Competing
transitions / routing".

Example:

```ts
// Pass branch
export default Lambda((tokensByPlace, parameters) => {
  return tokensByPlace.QAQueue[0].quality >= parameters.quality_threshold;
});

// Fail branch
export default Lambda((tokensByPlace, parameters) => {
  return tokensByPlace.QAQueue[0].quality < parameters.quality_threshold;
});
```

So the answer is:

- Yes, predicates can model branches today.
- No, branches are not represented as a separate typed object.
- A "branch metric" would probably be a transition metric or a derived group of
  transitions sharing an input place.

Important distinction:

- Counting how often a branch fires is possible with transition state
  (`firedInThisFrame`, `firingCount`).
- Counting how many branches pass their predicate before firing is not currently
  exposed as metric data.

If we need "number of branches that pass the predicate", the engine should expose
predicate/enablement evaluation per transition per frame, for example:

```ts
type TransitionEvaluationState = {
  transitionId: string;
  enabled: boolean;
  predicatePassed: boolean | null;
  firingCount: number;
  firedInThisFrame: boolean;
};
```

Without that, the nearest useful visualization is "transition fired count" or
"transition throughput", not "predicate pass count".

## Minimal Visualizations For Now

We should keep the initial visualization set small:

1. Scalar over time
   - average tokens in a place,
   - transition throughput,
   - infected fraction,
   - average over runs for the current frame.

2. Histogram per frame
   - token count distribution for a place across runs.

3. Branch/transition count
   - count or percentage of runs where a transition fired this frame,
   - total firing count over time,
   - later: count of runs where a predicate passed.

This is enough to validate the metric abstraction without designing a full chart
grammar.

## Persistence

Metrics should not be persisted in the SDCPN file format for now.

Reasoning:

- Metrics are currently scoped to Monte Carlo simulation, not the Petri net
  structure itself.
- The output model is not final.
- The persisted metric shape only supports one number over time.
- Persisting arbitrary JS code creates migration, security, and compatibility
  problems.
- Visualization needs are still being discovered.
- A persisted schema will be harder to change once users have files containing
  metric definitions.

The current persisted `Metric` should therefore be removed, hidden, or treated
as legacy until a final design exists.

Pragmatic migration path:

1. Stop serializing metrics in new files.
2. Stop offering `addMetric`, `updateMetric`, and `removeMetric` as general
   SDCPN mutation actions.
3. Keep import tolerant for older files if needed, but either ignore metrics or
   map them into an in-memory run configuration.
4. Remove `metrics?: Metric[]` from the core `SDCPN` type once callers are
   updated.
5. Keep Monte Carlo metrics under simulation/runtime APIs, not file-format APIs.

This avoids locking the file format to a design we already know is incomplete.

## Should Current Metrics Be Reworked?

Yes.

The current persisted metric model should be considered a temporary authoring
prototype, not the foundation.

The Monte Carlo runtime metric model is closer to the right direction, but it
should still be reworked before adding many metric types.

Recommended target:

```ts
type MonteCarloMetricSpec =
  | { kind: "placeTokenCountDistribution"; id: string; placeIds?: string[] }
  | { kind: "placeTokenCountMean"; id: string; placeId: string }
  | { kind: "transitionFiringRate"; id: string; transitionId: string }
  | { kind: "transitionPredicatePassCount"; id: string; transitionId: string };

type MonteCarloMetricAccumulator = {
  readonly descriptor: MetricDescriptor;
  observeFrame(context: MonteCarloFrameMetricContext): void;
  drain(): readonly MetricEmission[];
  clear(): void;
};
```

For user-defined metrics, there are two separate cases:

1. In-process callbacks
   - useful for tests, scripts, notebooks, and advanced local usage;
   - can accept `(run) => number | null`.

2. Serializable authored metrics
   - possible later, but should be a deliberate sandboxed feature;
   - should not be persisted until the authoring and security model is stable.

## Performance Concerns

The current design is acceptable for small experiments, but it has several
scaling risks.

### Frame History Grows Without Bounds

Metrics store every frame in arrays.

For long simulations with many runs and places, this can become large quickly.
The API should support:

- configurable sampling interval,
- bounded history / ring buffers,
- `drain()` for streaming pending emissions,
- final summaries separate from frame-by-frame history.

### Worker Messages Are Shape-Specific

The worker sends `distributionFrames`.

Every new worker metric would require a new message type unless we introduce
generic metric emissions.

Prefer:

```ts
{ type: "metricEmissions"; emissions: MetricEmission[] }
```

### Store Updates Recompute Too Much

The local experiment path currently derives metric state by flattening all
metric frame arrays each sync.

That is fine for tests, but for larger runs it becomes O(total history) per
batch. Prefer append-only updates or drained emissions.

### User Metrics Are Expensive Per Run Per Frame

`createMonteCarloUserDefinedMetric()` calls user code for each sampled run on
each observed frame. That is flexible but expensive.

Built-in metrics should use optimized access paths:

- dense `Uint32Array` place counts for place count metrics,
- transition state arrays for transition metrics,
- no per-run object allocation where possible.

User-defined metrics should remain available, but not be the primary way to
implement common metrics.

### Distribution Metrics Allocate Per Frame

`createPlaceTokenCountDistributionMetric()` creates fresh histograms every
observed frame.

This is simple and correct. If distribution metrics become hot, consider
reusing scratch buffers inside the accumulator and only allocating the emitted
sparse bins.

## Recommended Near-Term Design

For the next iteration, I would keep it intentionally narrow:

1. Remove persisted SDCPN metrics from the public authoring/file-format path.
2. Define runtime-only Monte Carlo metric specs.
3. Add three built-in specs:
   - place token count mean,
   - place token count distribution,
   - transition firing count/rate.
4. Keep user-defined callback metrics only for direct/local simulator use.
5. Add one generic metric output stream.
6. Let UI choose visualizations from descriptors and value shapes.

This gives enough generic structure for future visualizations without building a
full visualization framework too early.

## Open Questions

- Should a metric sample active runs by default, all runs, or completed runs?
  Current behavior differs by metric type.
- Should final completed runs continue contributing their last frame to later
  frame aggregates?
- Do we need predicate pass counts, or are transition firing counts sufficient
  for the first branch visualization?
- Should branch groups be explicit, or derived from competing transitions with a
  shared input place?
- Should user-authored metric code ever be persisted, or should persisted
  metrics only be declarative built-in specs?
- Should metric results be stored after a run completes, or only streamed to
  subscribers while the experiment is alive?

## Conclusion

The current runtime metric direction is promising, but the persisted metric
schema is premature.

Metrics should be treated as Monte Carlo runtime configuration and streamed
we have a generic value model, a small set of proven built-ins, and a clear
answer for user-authored code.
