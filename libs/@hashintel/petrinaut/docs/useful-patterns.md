# Useful Patterns

Useful modelling techniques for Petri nets in Petrinaut.

## Modelling duration (exponential)

For processes with **exponentially distributed** duration, set the transition's stochastic firing rate to `1 / mean_duration`. The exponential distribution is built into the stochastic firing mechanism -- no extra setup needed.

```ts
export default Lambda((tokensByPlace, parameters) => {
  return 1 / parameters.mean_repair_time;
});
```

This is the simplest way to model duration and works well for many processes (service times, failure intervals, etc.).

## Modelling duration (non-exponential)

For other distributions (e.g. log-normal, deterministic), place dynamics and durations sampled in the preceding transition kernel can be used. The general approach:

This pattern requires stochasticity to be enabled. If stochasticity is disabled, use fixed numeric duration values instead of `Distribution`.

1. **Add a time dimension** to the token type (e.g. `remaining_time`).
2. **Sample the duration** in a transition kernel using a `Distribution`:

```ts
export default TransitionKernel((tokensByPlace, parameters) => {
  return {
    InProgress: [
      {
        remaining_time: Distribution.Lognormal(2.0, 0.5),
        // ... other dimensions
      },
    ],
  };
});
```

1. **Count down** with a differential equation:

```ts
export default Dynamics((tokens, parameters) => {
  return tokens.map(() => ({ remaining_time: -1 }));
});
```

1. **Guard the completion transition** with a predicate:

```ts
export default Lambda((tokensByPlace, parameters) => {
  return tokensByPlace.InProgress[0].remaining_time <= 0;
});
```

**Alternative approach:** use two dimensions -- a fixed `sampled_duration` that doesn't change and a `counter` that increments via dynamics. Guard on `counter >= sampled_duration`. This preserves the original sampled value for inspection.

## Resource pools

Use a place as a **pool** of tokens representing limited resources (machines, workers, servers). Transitions consume from the pool when starting work and return tokens when done.

**Structure:**

```text
(Available) ---> [StartWork] ---> (InUse) ---> [FinishWork] ---> [Available)
```

The number of initial tokens in "Available" determines the resource capacity. If no tokens are available, "StartWork" cannot fire -- work is naturally queued.

**Example:** the [Production With Machine Failure](examples.md#production-with-machine-failure) example models machines cycling between available, producing, broken, and being repaired states.

## Shared-state checks with read arcs

Use a [read arc](petri-net-extensions.md#read-arcs) when a transition needs a token to be present, and may need to inspect its typed attributes in the lambda or kernel, but should leave that token in place.

**Structure:**

```text
(SensorState) ---> [ReactToReading]    (read arc, weight 1)
```

The transition can read `tokensByPlace.SensorState[0]` while the sensor-state token remains available for future transitions.

## Mutual exclusion with inhibitor arcs

Use an [inhibitor arc](petri-net-extensions.md#inhibitor-arcs) from a "busy" or "blocked" place to prevent a transition from firing while a condition holds.

**Structure:**

```text
(Busy) ---o [StartNew]    (inhibitor arc, weight 1)
```

"StartNew" can only fire when "Busy" has zero tokens. Once something enters the busy state, no new work can start until the token is removed.

**Example:** the [Deployment Pipeline](examples.md#deployment-pipeline) uses inhibitor arcs to block new deployments while an incident is being investigated or another deployment is already in progress.

## Source transitions (exogenous arrivals)

A transition with **no input arcs** is always structurally enabled. Set a stochastic rate to model arrivals following a Poisson process.

```ts
export default Lambda((tokensByPlace, parameters) => {
  return parameters.arrival_rate;
});
```

Use the transition kernel to define the properties of newly created tokens (if the output place is typed).

**Examples:**

- [Deployment Pipeline](examples.md#deployment-pipeline) -- "Create Deployment" and "Incident Raised" generate events at configurable rates.
- [Probabilistic Satellite Launcher](examples.md#probabilistic-satellite-launcher) -- "LaunchSatellite" creates satellites with randomized initial positions and velocities using `Distribution.Uniform` and `Distribution.Gaussian`.

## Sink transitions (removal / absorption)

A transition with **no output arcs** consumes tokens without producing any. Useful for modelling:

- **Expiry** -- tokens that age out or are consumed.
- **Departure** -- entities leaving the system.
- **Disposal** -- rejected or failed items.

No special configuration needed -- just create a transition with input arcs only.

## Competing transitions / routing

Multiple transitions consuming from the **same place** with **complementary predicates** can model routing or branching decisions.

**Structure:**

```text
              /--> [Pass]  ---> (Dispatched)
(QAQueue) --<
              \--> [Fail]  ---> (Disposed)
```

```ts
// Pass transition
export default Lambda((tokensByPlace, parameters) => {
  return tokensByPlace.QAQueue[0].quality >= parameters.quality_threshold;
});

// Fail transition
export default Lambda((tokensByPlace, parameters) => {
  return tokensByPlace.QAQueue[0].quality < parameters.quality_threshold;
});
```

**Example:** the [Supply Chain with Disruption](examples.md#supply-chain-with-disruption) example routes production batches to finished goods or scrap based on a quality threshold, and inbound/outbound shipments to received-or-damaged and delivered-or-lost.

## Arc weight for multi-token operations

An input arc with **weight > 1** requires multiple tokens from the same place for the transition to be enabled. This is useful for interactions between entities.

**Example:** the [Probabilistic Satellite Launcher](examples.md#probabilistic-satellite-launcher) example has a "Collision" transition with input weight 2 from the "Space" place -- it requires two satellites to be present and checks their distance in the lambda to detect collisions.

The transition kernel receives the consumed tokens and can compute outputs based on all of them.

## Optimization objectives (metrics that read parameters)

A [metric](simulation.md) can read `parameters` directly, not just place token counts. This lets one metric express an economic objective -- revenue minus costs -- whose value depends both on how the run unfolded and on the decision parameters that drove it. Maximizing (or minimizing) that metric turns the model into an optimization problem.

**Structure:**

```ts
// Profit objective: revenue from sold orders, net of holding, stockout, and
// policy costs. `parameters` exposes the tunable decision levers.
const revenue = state.places.SoldOrders.count * parameters.selling_price;
const holdingCost = state.places.FinishedGoods.count * 0.05;
const stockoutPenalty = state.places.LostSales.count * 12;
const policyCost =
  0.08 * parameters.production_rate + parameters.marketing_spend;
return revenue - holdingCost - stockoutPenalty - policyCost;
```

Expose the levers you want to tune (production rate, price, reorder threshold, ...) as [global parameters](petri-net-extensions.md#global-parameters) or [scenario parameters](scenarios.md), keep the rest fixed, then search over parameter values to move the objective. Because policy costs are charged per observation, compare runs at the same simulation horizon.

**Example:** the [Supply Chain Profit](examples.md#supply-chain-profit) example illustrated maximization of a `Profit` metric over six operational decision parameters. Its metric combines token counts (sold orders, finished goods, lost sales) with parameter-driven policy costs, and the Petrinaut CLI can drive the parameter search from an optimization manifest.
