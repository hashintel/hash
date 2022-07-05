---
title: Performance
slug: simulation/extra/performance
objectId: beaf7fe2-b926-452c-a38a-3299e74a34e4
---

# Performance

There are several possible reasons your simulation is running slowly. Broadly we bucket them in three categories: data, compute, and hardware.

- **Data**: You're creating a lot of agents or importing a very large dataset
- **Compute**: Your agents' behaviors are performing expensive calculations.
- **Hardware**: Your local compute isn't powerful enough to run the underlying HASH environment.

Below we explain these common performance bottlenecks and solutions you can use to improve your simulation's performance. Alternatively you can use [hCloud](/docs/simulation/creating-simulations/h.cloud) to run simulations on dedicated remote hardware and stream these results back to your local machine.

We're also happy to chat through techniques to improve your simulation's performance in our [HASH community Discord](/discord) and [support forum](https://hash.community/).

## Data

Running in-browser, hCore can comfortably initialize 100-1000 agents, with one to ten behaviors each, before running into performance constraints. And while you can import datasets of any size into a simulation, datasets greater than 200MB in size can contribute to slower running simulations.

The general solution is to keep your initial simulation agent population small, and then once you have the core simulation dynamics modeled, increase the number of agents and run it on hCloud, or let it run for a longer period of time in the background.

For handling large datasets, consider preprocessing the data, for instance in an iPython notebook w/ Pandas, to only use the segments of data you need for the simulation. Often we've found people have imported a lot of extra data when, to simulate agents, they only need a small handful of columns from a much larger dataset.

<Hint style="info">
In the future we'll be bringing support for much larger datasets to both the client-side version of hCore and simulations running in hCloud.
</Hint>

## Compute

Each agent runs its array of behaviors every time step - if a behavior is performing very complex calculations, it can slow down the simulation as a whole.

The most common expensive behavior we see is using many agents with large `"search_radius"`. If an agent has a [search radius](/docs/simulation/creating-simulations/anatomy-of-an-agent/context#neighbors), the HASH engine will calculate the neighbors for the agent, which is how`context.neighbors()` will return the agents neighbors. Calculating neighbors involves searching over the simulation state, which can be expensive when many agents are calling neighbors.

Often you can use messages to communicate between agents and request information instead of relying on retrieving many neighbors. Alternatively you might consider creating a manager agent that has a search radius which calls `context.neighbors()` and stores the results which other agents can retrieve by messaging the manager agent.

Other common reasons for slowdown are not specific to HASH's Engine, but are general performance problems, such as running O\(n^2\) algorithms over large datasets. After you've created the initial design of your simulation, consider going back through and finding ways to make the behaviors more efficient.

<Hint style="info">
While in general it's good to optimize your functions and behaviors, be wary of premature optimization. If your simulation only has a few agents, the difference between searching through an agents message array with an O\(n\) loop or an O\(n^2\) loop will be minor.
</Hint>

## Hardware

hCore is designed to be run on a wide variety of machines but it prefers modern hardware. You can find out more over on our [System Requirements](/docs/simulation/extra/specs-requirements) page.

## Identifying Performance Issues

In the 3D viewer, you can `Open Controls > Toggle Stats` to view live stats on your simulation. These statistics can help diagnose what is causing the slowdown.

- MS: Number of milliseconds to return the new state.
- FPS: Frames per second in the 3d viewer.
- MB: Total size of the simulation

MS and FPS reflect the total time from state _t_ to state _t_+1. If this is taking thousands of MS, you likely have too many agents or too complex of behaviors. If the FPS are particularly low, consider turning on 2D mode.

MB reflects the size of the simulation - each simulation run is stored locally. If a simulation has been run for tens of thousands of time steps, or if there are many agents, it might become too large for your browser.

![Stats window for debugging](https://cdn-us1.hash.ai/site/docs/kapture-2020-12-17-at-10.26.05.gif)
