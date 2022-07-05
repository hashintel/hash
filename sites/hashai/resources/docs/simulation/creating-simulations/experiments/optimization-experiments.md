---
title: Optimization Experiments
slug: simulation/creating-simulations/experiments/optimization-experiments
objectId: c6db0e46-61e0-4500-97e0-7e5159bb5800
description: How to use HASH to optimize your simulation's parameters
---

# Optimization Experiments

Often, when running an experiment, you don't necessarily want to see every simulation's outcomes, you want to find the best ones, the parameters that **optimize** a desired metric. With HASH's optimization engine, you can automatically generate simulations and find the set of parameters that will maximize or minimize a metric.

<Hint style="info">
Optimization experiments can only be run on [hCloud](/docs/simulation/creating-simulations/h.cloud)
</Hint>

## Creating Optimization Experiments

To create an optimization experiment, first create the metric that represents the value you want to optimize.

<Hint style="info">
[Read more on defining metrics](/docs/simulation/creating-simulations/views/analysis/metrics).
</Hint>

For example, in [Sugarscape](https://staging.hash.ai/@hash/sugarscape/stable), you might be interested in what parameters will optimize the average sugar of cells. In that case you can use the existing metric:

![Metric defined in Sugarscape](https://cdn-us1.hash.ai/site/docs/image%20%2858%29.png)

Now use the experiment wizard to create a new experiment and fill in the options:

![](https://cdn-us1.hash.ai/site/docs/image%20%2860%29%20%281%29.png)

- Select `optimization` as the type.
- Use the metric name you previously defined as the metric.
- Decide whether to `maximize` or `minimize` the objective.
- Select the fields \([globals](/docs/simulation/creating-simulations/configuration/)\) that will be varied and define their constraints.

### Specifying Constraints

For each field being varied, you must specify the valid values \(constraints\) for the optimization experiment. You can specify discrete values with a comma separated list, with or without spaces:

- `true, false`
- `1,2,3`
- `"one", "two"`

You can also specify ranges of values using `-` for fields which accept `numbers`.

- `1-3`
- `-3-0`
- `-10 - -3`

### Running an Optimization

You can choose to run your experiment in hCloud directly upon creating it, or save your experiment to be run later from the **Experiments** dropdown in the menubar.

<Hint style="warning">
To run a simulation in hCloud, you must first set the [Behavior Keys](/docs/simulation/creating-simulations/behaviors/behavior-keys/) of your simulations behaviors.
</Hint>

While the optimization experiment is running, individual runs will populate the experiment queue in the activity sidebar. Hover over a run to see the metrics value and the parameters for that particular run.

![In-progress optimization run](https://cdn-us1.hash.ai/site/docs/image%20%2860%29.png)

When the optimization run completes, the best run - the run where the parameters maximized or minimized the metric - will be highlighted.

![](https://cdn-us1.hash.ai/site/docs/image%20%2861%29.png)
