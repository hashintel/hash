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

1. **Add a time dimension** to the token type (e.g. `remaining_time`).
2. **Sample the duration** in a transition kernel using a `Distribution`:

```ts
export default TransitionKernel((tokensByPlace, parameters) => {
  return {
    InProgress: [{
      remaining_time: Distribution.Lognormal(2.0, 0.5),
      // ... other dimensions
    }],
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

**Example:** the [Production Machines](examples.md#production-machines) example models machines cycling between available, producing, broken, and being repaired states.

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
- [Probabilistic Satellites Launcher](examples.md#probabilistic-satellites-launcher) -- "LaunchSatellite" creates satellites with randomized initial positions and velocities using `Distribution.Uniform` and `Distribution.Gaussian`.

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

**Example:** the [Supply Chain (Stochastic)](examples.md#supply-chain-stochastic) example routes products to dispatch or disposal based on a quality threshold.

## Arc weight for multi-token operations

An input arc with **weight > 1** requires multiple tokens from the same place for the transition to be enabled. This is useful for interactions between entities.

**Example:** the [Satellites in Orbit](examples.md#satellites-in-orbit) example has a "Collision" transition with input weight 2 from the "Space" place -- it requires two satellites to be present and checks their distance in the lambda to detect collisions.

The transition kernel receives the consumed tokens and can compute outputs based on all of them.
