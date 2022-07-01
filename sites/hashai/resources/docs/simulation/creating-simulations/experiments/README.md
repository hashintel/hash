---
title: Experiments
slug: simulation/creating-simulations/experiments
objectId: d8aaa790-5ce3-45cd-95e7-9e1024be7305
description: "Sweep parameters, explore a search space, and find optimal configurations"
---

# Experiments

In addition to running single simulation runs, HASH enables simultaneous simulation runs with different parameters.

In HASH, experiments are defined in the `experiments.json` file. Currently supported are:

- `linspace` - vary a single parameter within a range
- `arange` - vary a parameter based on an increment
- `values` - manually enter values for a specific parameter
- `monte-carlo` - generate random numbers according to a distribution
- `group` - group together multiple experiment types into a single experiment
- `multiparameter` - create all possible parameter combinations from multiple experiments
- `optimization` - efficiently identify optimal parameter combinations that minimize or maximize desired metrics

Experiments can be created with the Experiments Wizard, or by manually defining them in the `experiments.json` file. You can access the wizard through the Experiments icon \(beaker\) in the runner controls, or from the menu bar along the top of hCore.

![The Experiment Creation Wizard](https://cdn-us1.hash.ai/site/docs/image%20%2838%29.png)

For example, this `values` experiment will run seven experiments, setting a different value of \[0..6\] in the radius field in each one.

<Tabs>
<Tab title="experiments.json" >

```javascript
{
    "Sweep values": {
        "type": "values",
        "field": "radius",
        "values": [0,1,2,3,4,5,6],
        "steps": 100
    }
}
```

</Tab >
</Tabs>

To run an experiment, click the "Experiment Runner" button in the runner controls, denoted with a beaker icon. The option "Sweep Values" will be available in the selector.

![Sweep values demonstration](https://cdn-us1.hash.ai/site/docs/image%20%2816%29.png)

<Hint style="success">
If you want to run an experiment from another user's published simulation - for instance an example simulation - first save a copy to your drive and then click the experiment runner.
</Hint>

Running this experiment will generate 7 new simulations, each with a slightly different globals.json. If we run the simulation, we can see exactly which parameters get changed in the sidebar:

![Radius options](https://cdn-us1.hash.ai/site/docs/image%20%2817%29.png)

To access the changed varied parameter from within the simulation, we simply access that parameter from `context.globals()`:

```javascript
const behavior = (state, context) => {
  const { radius } = context.globals();
};
```

Now, any behaviors that rely on the "radius" parameter from `globals.json` will use the corresponding value.

<Hint style="info">
You can run experiments locally or in [hCloud](/docs/simulation/creating-simulations/h.cloud)
</Hint>

For more information on specific syntax, read more about [Experiment Types](/docs/simulation/creating-simulations/experiments/experiment-types).

<Embed type="youtube" url="https://youtu.be/tLcrXQxN70c" />
