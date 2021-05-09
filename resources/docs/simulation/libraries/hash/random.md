---
description: hstd functions for generating pseudo-random numbers.
---

# Random

## random\(\)

Returns a number between 0 and 1. If setSeed has been called, it uses the [sfc32 algorithm](https://github.com/bryc/code/blob/master/jshash/PRNGs.md#sfc32), otherwise it defaults to the browser's implementation of Math.random\(\).

```javascript
function behavior(state, context) {
    if (hstd.random() > 0.5) {
        // do something
    }
}
```

## setSeed\(s: string\)

Sets a seed for the random number generator used in hash\_stdlib.random\(\) and in any stochastic function in [hash\_stdlib.stats](javascript-libraries.md#jstat-distributions). The seed will apply across all behaviors and agents within a simulation run.

```javascript
function behavior(state, context) {
    if (state.timestep == 1) {
    // If it's the first timestep, set the initial seed of the sim.
        hstd.setSeed("initial_seed");
    }
    const num_new_agents = poisson.sample(10); // will return the same sample every run
}
```

