---
title: Probability Distributions
slug: simulation/concepts/designing-with-distributions
objectId: 692fd35b-3ada-43be-8d32-79c939111f48
---

# Probability Distributions

Multi-Agent Simulation approaches problem-solving from a stochastic lens. Instead of quantitatively or numerically determining the solution to a set of equations representing a system, HASH will let you approximate messy, complex real-world systems, and empirically and statistically come to conclusions about how they behave. In order to better approximate the real world, you'll often want to initialize agents with heterogeneous properties, and ensure your behaviors properly randomize when necessary. Here are a number of ways you can incorporate stochasticity into your HASH simulations.

## Distributions

Initializing agent properties using different types of distributions is a common practice in Multi-Agent models. In HASH, you can use the [jStats](http://jstat.github.io/distributions.html) library or the [NumPy](https://docs.scipy.org/doc/numpy-1.15.4/reference/routines.random.html) package for sampling distributions. Here's an example that uses a number of these distributions to create agents:

- We've sampled a Poisson distribution to determine how many new birds arrive at each step.
- We've sampled a uniform distribution to determine its `x` and `y` coordinates.
- We've sampled a triangular distribution to determine its altitude.
- We've sampled a normal distribution to determine its speed.

<Tabs>
<Tab title="JavaScript" >

```javascript
function behavior(state, context) {
  const { poisson, uniform, triangular, normal } = hstd.stats;

  const num_new_agents = poisson.sample(10); // expected occurence rate

  for (let i = 0; i < num_new_agents; i++) {
    const x = uniform.sample(0, 10); // min, max
    const y = uniform.sample(0, 10);

    const altitude = triangular.sample(10, 10000, 500); // min, max, mode

    state.addMessage("hash", "create_agent", {
      agent_name: "bird",
      position: [x, y, altitude],
      speed: normal.sample(25, 10), // mean, standard deviation
    });
  }
}
```

</Tab >

<Tab title="Python" >

```python
from numpy.random import poisson, uniform, triangular, normal

def behavior(state, context):
  num_new_agents = poisson(1); # expected occurence rate

  for i in range(num_new_agents):
    x = uniform(0, 10); # min, max
    y = uniform(0, 10);

    altitude = triangular(10, 50, 200) # min, mode, max

    state.add_message("hash", "create_agent", {
      "agent_name": "bird",
      "position": [x, y, altitude],
      "speed": normal(25, 10), # mean, standard deviation
    })
```

</Tab>
</Tabs>

You can find an example of these distribution methods being used in the Consumer Credit simulation. The _create_client.js_ behavior uses three of the above methods to initialize heterogeneous agents.

<Embed type="hash" url="https://hash.ai/@hash/consumer-credit" caption="" />

### Empirical Distributions

If you are creating simulations from data consisting of observations, as opposed to having summary statistics, you are trying to use empirical distributions in your simulation. There are many ways you might implement this, but one of the simplest is using Python's `random.choice` method. By providing a list of values and a corresponding list of probabilities, you've effectively implemented an empirical distribution function.

You can find a working example of this in the Alcoholism Intervention model. The `births_intervention.py_` and `births_control.py` behaviors both make use of this python method in concert with a dataset.

<Embed url="https://hash.ai/@hash/alcohol-use-dynamics-empirical-distributions" caption="" />

By implementing more advanced methods, you can create empirical distributions with linear or polynomial interpolation. We encourage you to share whatever you create!

<Hint style="info">
You can ensure deterministic runs by using HASH standard library functions and [setting the seed of the random number generators](/docs/simulation/extra/determinism) with `hstd.setSeed("[string]")`
</Hint>
