---
description: Globals are variables which are accessible to all agents in a simulation
---

# Globals

Global variables are defined in the `globals.json` file present within every simulation. These variables are immutable while the simulation is running and are accessible to all agents simultaneously.‌

Globals are typically used to specify environmental variables \(e.g. [topology](topology/)\) or macro assumptions \([simulation parameters](basic-properties.md)\) that define the state of the world.

Accessing these global variables is as simple as using the `context.globals()` function in any agent behavior.

To modify globals while a simulation is running, first pause the simulation before making any changes, reset the simulation, and resume.

{% hint style="info" %}
HASH does not support modifying globals mid-step, but support for modifying globals between steps is coming soon.
{% endhint %}

There are two types of global variables in HASH:

* [simulation parameters](basic-properties.md) - these capture truths or assumptions about the state of your world
* [topological parameters](topology/) - define the extent of the world using [bounds and wrapping](topology/bounds-and-wrapping.md), determine how agents interact with the borders \(if any\) of spatial simulations using [wrapping presets and flags](topology/wrapping-presets-and-flags.md), and configure how [distance calculations](topology/distance-functions.md) are conducted across topologies

