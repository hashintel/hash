---
layer: react.experiments
name: Experiments provider
role: Tracks Monte Carlo experiment handles and their streamed metric results
boundaries:
  - kind: worker
    note: Only metric aggregates arrive from the experiment worker; frame buffers never reach this layer
---

# Experiments provider

One `MonteCarloExperiment` handle per running experiment, with its stores
subscribed into React.

Unlike the simulation provider, this layer never sees frames. The Monte Carlo
runtime keeps frame buffers inside its worker and posts only aggregates, so what
arrives here is already reduced — medians, means, percentiles per metric. That is
why many experiments can run concurrently without memory scaling in the number of
runs.
