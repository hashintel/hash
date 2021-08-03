# Experimenting with Process Models

You can use experiments to explore different potential scenarios with a process model. For example if you want to understand how a process will run when it has half the people working on it, or double the people, you can automatically generate and compare simulation runs with those parameters.

<Hint style="info">
See the [experiments section](../../creating-simulations/experiments/) for more on experiments in HASH in general.
</Hint>

To run an experiment, you'll want to first identify the parameter of the process you want to explore. For example, in a model with a service block:

```javascript
// Snippet of a process model

  "support_resources_solving_stuff": {
       "time": 2,
       "resource": "service_agents",
       "track_wait": true
     },
   "service_agents": 6


In this model we could run experiments with the “service\_agents” property and see how it responds to different numbers of agents.

To do that, we'll set service\_agents as a global parameter.

<Hint style="info">
The [Globals](../../creating-simulations/configuration/) section describes how and why to use globals.
</Hint>

1. Add a property to globals.json.

** globals.json **

```javascript
{
 "num_service_agents": 6
}


1. Replace the property on the process model with the global parameter.

```javascript
// create_process.js

"service_agents": Math.floor(context.globals().num_service_agents),


1. Create an experiment and use the parameter as the field for the experiment

![Experiment model](https://lh5.googleusercontent.com/9fJKOO9RlHGjnmFrS4gX2mAWDjXLHlHLTTbfYbFIxBsJ_PWIToyh9N-s0kRCSJU_jWi3sQ1v1bQISW774tbTqy_C7apNVzbr3lEJFxhJndlzWnYlXdWzrAqq2rQOssuLLdw4hP3j)

Now when we run the experiment, we can see how varying the number of service agents effects the descriptive metrics of the process model.

![](https://lh5.googleusercontent.com/EOBydAKWL0GoGZQAZMqFj_weIFdVjdLVtcPX1Q3mtftPQiOfQoPPVk0hc3lS4j1mVp_T2A-ByLBYk9yWlmzMm74sjcALRnyfhLAX-taDlfrpbmcwWsbEs3fTnKg4E1_f6_1fLF4X)

After adding metrics and charts, we can see what happens to the queue in the experiment. Provided the number of agents stays above 1, the queue will remain flat.

