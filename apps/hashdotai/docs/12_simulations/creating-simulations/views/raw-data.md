---
title: Raw Data
slug: simulation/creating-simulations/views/raw-data
objectId: 0aa39b69-df1b-4834-915e-aeb86e846077
---

# Raw Data

There are two ways that you can access the raw data which makes up a simulation. The **Raw Output** View will allow you to inspect the state of the simulation at the current time step, and hCore also allows you to export the full simulation as JSON.

## Raw Output

You can switch to the **Raw Output** View by clicking the corresponding tab above the Viewer, or by using the **View** menu along the top of hCore. This view will display the entire simulation state at the current time step, formatted as a list of JSON objects representing each agent.

![The Raw Output view in hCore](https://cdn-us1.hash.ai/site/docs/image%20%2837%29.png)

## Exporting Simulation Runs

You can save the data from any of your simulation runs by right clicking on an individual run and clicking "Export as JSON Files". You can do this for both single runs and for Experiment runs.

![Exporting simulation runs](https://cdn-us1.hash.ai/site/docs/export.png)

This will allow you download both the Raw Data (which contains the full definition of every agent at every step in the simulation) and the Analysis outputs (based on the metrics you’ve defined in the Analysis tab).
