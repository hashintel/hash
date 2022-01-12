---
title: Globals
slug: simulation/creating-simulations/configuration
objectId: c24c4485-292d-46a8-9c72-8c66aab52e23
description: Globals are variables which are accessible to all agents in a simulation
---

# Globals

Global variables are defined in the `globals.json` file present within every simulation. These variables are immutable while the simulation is running and are accessible to all agents simultaneously.‌

Globals are typically used to specify environmental variables \(e.g. [topology](/docs/simulation/creating-simulations/configuration/topology/)\) or macro assumptions \([simulation parameters](/docs/simulation/creating-simulations/configuration/basic-properties)\) that define the state of the world.

Accessing these global variables is as simple as using the `context.globals()` function in any agent behavior.

To modify globals while a simulation is running, first pause the simulation before making any changes, reset the simulation, and resume.

<Hint style="info">
HASH does not support modifying globals mid-step, but support for modifying globals between steps is coming soon.
</Hint>

There are two types of global variables in HASH:

- [simulation parameters](/docs/simulation/creating-simulations/configuration/basic-properties) - these capture truths or assumptions about the state of your world
- [topological parameters](/docs/simulation/creating-simulations/configuration/topology/) - define the extent of the world using [bounds and wrapping](/docs/simulation/creating-simulations/configuration/topology/bounds-and-wrapping), determine how agents interact with the borders \(if any\) of spatial simulations using [wrapping presets and flags](/docs/simulation/creating-simulations/configuration/topology/wrapping-presets-and-flags), and configure how [distance calculations](/docs/simulation/creating-simulations/configuration/topology/distance-functions) are conducted across topologies
