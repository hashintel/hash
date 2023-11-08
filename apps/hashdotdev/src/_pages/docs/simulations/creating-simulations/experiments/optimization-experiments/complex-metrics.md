---
title: Complex Metrics
slug: simulation/creating-simulations/experiments/optimization-experiments/complex-metrics
objectId: 299b81a3-c732-4528-bba3-88bf765bb114
---

# Complex Metrics

HASH has a robust analysis system in place, allowing users to gather data from their simulation with metrics, and plot them in numerous different graph types. By defining an agent in your simulation that performs its own data collection and transformation, you can generate more complex metrics which represent weighted combinations of other metrics and datasets. This can unlock additional functionality in your HASH simulations.

## Creating a Complex Metric

In a simulation like [Interconnected Call Centers](https://core.hash.ai/@hash/interconnected-call-center/3.1.0), a modeler’s main goal might be to reduce the number of balked calls that occur during a simulation run. The number of balked calls is already a defined metric, so we can easily spin up an optimization experiment. Running it, we discover that the optimal number of call centers is infinity! After all, the more call centers we initialize, the more calls we can handle.

However, in setting up this optimization, we’ve ignored an important business consideration: the more call centers we use, the higher the costs! We need to create a new metric that accounts for these costs and optimizes within a cost constraint.

To do this, we’ll initialize a new agent whose task is to calculate this more complex metric. We'll follow these steps:

### 1. Define your complex metric

Before you start modifying your simulation, you should define how your complex metric will be calculated. It could be a ratio of two different values, the mean of all agents' specific field, etc. For instance, if the complex metric will be a weighted sum of various data produced by your simulation, you need to determine the values of those weights.

### 2. Create a new agent to calculate the complex metric

This agent must have a search radius that allows it to see all other agents in the simulation, and should be initialized in the center of the simulation. You can set the `state.hidden` field to `true` in order to remove it from the 3D Viewer

```javascript
{
  "behaviors": ["calculate_metric.js"],
  "position": [0, 0, 0],
  "search_radius": 100,
  "hidden": true
}
```

### 3. Create a new behavior which calculates this metric

```javascript
// calculate_metric.js

const behavior = () => {
  // Gather data
  const num_centers = context.globals().n_call_centers;

  const ns = context
    .neighbors()
    .filter((n) => n.nBalked > 0)
    .map((n) => n.nBalked);
  const balked_calls = hstd.stats.sum(ns);

  // Assign weights to different components of the metric
  const w_num_centers = 10;
  const w_balked_calls = 0.1;

  // Calculate the complex metric
  state.metric = w_num_centers * num_centers + w_balked_calls * balked_calls;
};
```

<Hint style="info">
Metric weights can also be captured as global parameters for easy modification
</Hint>

### 4. Create a new Analysis metric that collects the 'state.metric' field on your agent

![Defining the complex metric for use an optimization](https://cdn-us1.hash.ai/site/docs/image%20%2872%29.png)

Now you can go ahead and run your new and improved optimization, which takes into account more realistic cost constraints.

## Validating and Calibrating

An additional common use case for complex metrics is tuning a model. When we attempt to compare the outputs of our model to external data sources, we can use a complex metric to assess our model’s validity and perform some calibration.

Let's set up a slightly different complex metric:

### 1. Find and [upload a dataset](/docs/simulation/creating-simulations/datasets/)

### 2. Create a "metric agent" set in the center of the simulation, with an appropriate search radius

### 3. Create a new behavior for gathering and comparing simulation data

```javascript
// gather_data.js

const behavior = () => {
  // Gather data from agents
  const ns = context.neighbors().map((n) => n.field);
  const agent_avg = hstd.stats.mean(ns);

  // Gather data from the uploaded dataset
  const data_avg = context.data()[""][state.timestep];

  // Calculate the error between them
  state.error_metric = calc_error(agent_avg, data_avg);
  state.cumulative_error_metric += state.error_metric;
};
```

<Hint style="info">
Sum of squares is the typical method for calculating the error between a sample datapoint and "predicted" or modeled datapoint: _Error =  Sum of \(agent_avg - data_avg\)^2_
</Hint>

### 4. Now create a metric to capture the calculated error

![Define a metric to capture the cumulative error](https://cdn-us1.hash.ai/site/docs/image%20%2873%29.png)

Now that we have the error captured in a metric, we can apply it. You can:

1.  Run an experiment to compare different models or sets of parameters to the real-world data. By defining a maximum tolerable error, you can determine whether your model is a valid digital twin, or representation of reality.
1.  Use optimization experiments to minimize the error. This effectively calibrates your model to the data. You’ll need to have some estimate for the ranges of your global parameters to provide to the optimization engine.

![Defining an optimization experiment that will calibrate our model](https://cdn-us1.hash.ai/site/docs/image%20%2871%29.png)

By plotting your model output, and real-world values from the dataset, you should see the optimization experiment producing a well-calibrated model:

![Model output fitted to data](https://cdn-us1.hash.ai/site/docs/image%20%2870%29.png)
