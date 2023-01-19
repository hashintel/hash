---
title: Simulation Outputs
slug: simulation/creating-simulations/views
objectId: 521d303e-aa5c-4203-b7c4-43e27ea2914b
description: Accessing data and insights from simulation runs
---

# Simulation Outputs

**HASH lets users access their simulation outputs in a variety of built-in ways.** These include custom viewers for the 3D rendering, geospatial display, and charting/plotting of outputted simulation state.

Using the playbar at the bottom of the right-hand view pane you can scrub forwards and backwards through computed simulation states.

## 3D

**HASH natively supports rendering agents in 3D environments.** [Read more &gt;](3d-viewer)

## Analysis

**Analysis \(metrics and plots\) are in many cases the best way to view simulation outputs in HASH.** When you're not interested in the behavior of an individual agent, but aggregate trends over time or outcomes observed across the entire system, graphing metrics of interest can enable you to quickly identify and analyze outcomes.

## Geospatial

**Agents can be rendered on a map-view of the world by providing them with latlong co-ordinates.** Various examples in the hIndex showcase this \(e.g. [Local Competition](/@hash/local-competition), [Container Line](/@hash/container-line-sim)\)

## Raw Output

**The underlying data of any individual step is accessible from the 'Raw Output' tab.** This can be useful for debugging models during development, and allows for the raw state of simulations to be exported for further analysis.

## Step Explorer

**Dive into the statistics and distribution of any single step in the simulation.** Select, filter, and visualize all the data of all the agents in your simulation with just a few clicks.

The _Step Explorer_ has easy to use auto-generated charts to probe and understand what's happening with your agents on a given step. Unit visualizations are used which apply a one-to-one mapping between agent properties and the data points in the charts.

You can think of the Step Explorer as a counterpart to _Plots_, which tells you what's happening in aggregate across all of the time steps in a simulation run, while the Step Explorer lets you dive into a single time step and see what's happening within a population of agents in detail.

Step Explorer is useful for understanding the shape of the data within your simulation, and it's also helpful for debugging and noticing agent outliers, without having to write code or JSON.

## API

**The HASH API allows for programmatic access to simulation outputs.** [Read more &gt;](/docs/simulation/creating-simulations/views/api-1)

## Custom Views

<Hint style="info">
Allowing users to develop custom views is part of our public [product roadmap](/roadmap).
</Hint>
