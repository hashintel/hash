---
title: Experimenting with Process Models
slug: simulation/concepts/designing-with-process-models/experimenting-with-process-models
objectId: 7de9fbe8-8ae6-4753-9ec1-7ca22e56e377
---

# Experimenting with Process Models

You can use experiments to explore different potential scenarios with a process model. For example if you want to understand how a process will run when it has half the people working on it, or double the people, you can automatically generate and compare simulation runs with those parameters.

<Hint style="info">
See the [experiments section](/docs/simulation/creating-simulations/experiments/) for more on experiments in HASH in general.
</Hint>

To run an experiment, you'll want to first identify the parameter of the process you want to explore. For example, in a model with a service block:

```json
// Snippet of a process model

{
  "support_resources_solving_stuff": {
    "time": 2,
    "resource": "service_agents",
    "track_wait": true
  },
  "service_agents": 6
}
```

In this model we could run experiments with the “service_agents” property and see how it responds to different numbers of agents.

To do that, we'll set service_agents as a global parameter.

<Hint style="info">
The [Globals](/docs/simulation/creating-simulations/configuration/) section describes how and why to use globals.
</Hint>

1.  Add a property to globals.json.

    **globals.json**

    ```json
    {
      "num_service_agents": 6
    }
    ```

1.  Replace the property on the process model with the global parameter.

    ```javascript
    // create_process.js

    "service_agents": Math.floor(context.globals().num_service_agents),
    ```

1.  Create an experiment and use the parameter as the field for the experiment

![Experiment model](https://cdn-us1.hash.ai/site/docs/process+models+experiment.png)

Now when we run the experiment, we can see how varying the number of service agents effects the descriptive metrics of the process model.

![](https://cdn-us1.hash.ai/site/docs/process+experiment.png)

After adding metrics and charts, we can see what happens to the queue in the experiment. Provided the number of agents stays above 1, the queue will remain flat.
