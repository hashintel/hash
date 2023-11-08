---
title: Memory Management
slug: simulation/extra/memory-management
objectId: 213cbbb6-7434-433d-bb34-c1390606ed14
---

# Memory Management

Because HASH simulations generate and save states when they’re run, they can quickly exceed a browser tab's capacity (often about 1 GB). To avoid blowing up your computer's memory, you can set HASH simulations to only save the last specified number of timesteps in memory.

To retain a set of steps, hover over the run button and choose to keep all or a specific number of time steps.

![Playback Window](https://cdn-us1.hash.ai/site/docs/playback.png)

The step scrubber will show the appropriate range for the number of specified steps.

![Step Scrubber](https://cdn-us1.hash.ai/site/docs/step-scrubber-memory.png)

When running a simulation with only some of the steps retained, the analysis tab will only display the chart data calculated while the analysis tab is open; otherwise, it will drop those data points.

![Analysis Dropped Steps](https://cdn-us1.hash.ai/site/docs/analysis-dropped-steps.png)
