# Metrics

> This guide is a work in progress. The metrics workflow and this documentation
> may change as the feature continues to evolve.

A **metric** is a numeric value computed from simulation state over time. Use metrics when raw token counts are not the chart you need -- for example, an infected fraction, yield, queue pressure, or average token attribute.

## Timeline metrics

The [Timeline](simulation.md#timeline) has built-in views for:

- **Tokens per place** -- one series per place.
- **Tokens per type** -- one series per token type, when colours are enabled.
- **Transition firings** -- one series per transition.

Saved metrics appear in the same Timeline metric picker. Pick a metric to plot it, use **Create Metric** (+) to add one, use **Edit Metric** (pencil) for the selected metric, or use **Manage Metrics** (list) to open the metrics management view.

## Creating a saved metric

Click **Create Metric** from the Timeline header, or open **Manage Metrics** and click **Create**.

A saved metric has:

- **Metric name** -- label shown in the Timeline picker and metric lists.
- **Description** -- optional summary.
- **Code** -- a TypeScript function body that returns a finite number.

Metric code is a function body only: do not write `export default`, a wrapper, or an enclosing `function`.

The only variable in scope is `state`. Read places by name:

```ts
const infected = state.places.Infected.count;
const recovered = state.places.Recovered.count;
const total = infected + recovered;

return total === 0 ? 0 : infected / total;
```

For place names with spaces, use bracket access:

```ts
return state.places["Work In Progress"].count;
```

Each place exposes:

- `count` -- number of tokens in the place.
- `tokens` -- token objects for coloured places, or `[]` for uncoloured places.

`parameters` and `scenario` are not available in metric code. If you need a scenario-dependent result, encode the relevant value into the simulated state and read it from `state`.

Save is blocked while the metric has TypeScript errors, compile errors, or does not return a finite number.

## Experiment metrics

[Experiments](experiments.md) require at least one experiment metric before they can run. In the Create Experiment drawer, click **Add metric** and choose from:

- **Place tokens** -- aggregate a place's token count across runs.
- **Transition firing** -- aggregate per-frame or cumulative transition firing counts.
- **Model metrics** -- reuse saved metrics from the current net.
- **Custom code** -- write an experiment-only metric expression.

Experiment metric configuration is snapshotted when you press **Run**. Changing saved metrics later does not change experiments that have already started.
