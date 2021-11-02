---
title: Random
slug: simulation/creating-simulations/libraries/hash/random
objectId: b1f18a3b-9454-49c7-8dbf-70eceb24b940
description: hstd functions for generating pseudo-random numbers.
---

# Random

## random()

Returns a number between 0 and 1. If setSeed has been called, it uses the [sfc32 algorithm](https://github.com/bryc/code/blob/master/jshash/PRNGs.md#sfc32), otherwise it defaults to the browser's implementation of Math.random\(\).

```javascript
function behavior(state, context) {
    if (hstd.random() > 0.5) {
        // do something
    }
}
```

## setSeed(s: string)

Sets a seed for the random number generator used in hash_stdlib.random\(\) and in any stochastic function in [hash_stdlib.stats](/docs/simulation/creating-simulations/libraries/hash/javascript-libraries#jstat-distributions). The seed will apply across all behaviors and agents within a simulation run.

```javascript
function behavior(state, context) {
    if (state.timestep == 1) {
    // If it's the first timestep, set the initial seed of the sim.
        hstd.setSeed("initial_seed");
    }
    const num_new_agents = poisson.sample(10); // will return the same sample every run
}
```
