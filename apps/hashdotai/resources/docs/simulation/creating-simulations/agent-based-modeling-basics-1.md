---
title: Agent-Based Modeling Basics
slug: simulation/creating-simulations/agent-based-modeling-basics-1
objectId: f53e9d6f-902c-4fc1-b560-c9339f37ca5d
description: Learn the basic terminology
---

# Agent-Based Modeling Basics

Agent-based modeling \(ABM\) is a powerful way to simulate scenarios with complex deterministic behavior.

In contrast with traditional simulation and modeling, agent-based modelers describe the behavior of _individual agents,_ rather than using formulas to describe the behavior or dynamics of the system as a whole. This allows for complex interactions to emerge from basic rules. In HASH, we call these rules _behaviors._

A popular example of an agent-based simulation is Conway's _Game of Life_ - a simulation performed on a grid, where each cell can be either alive or dead. Here, the cells are _agents_, and the rules are _behaviors._ The behaviors for Conway's _Game of Life_ are as follows:

> 1.  Any live cell with two or three neighbors survives.
> 1.  Any dead cell with three live neighbors becomes a live cell.
> 1.  All other live cells die in the next generation. Similarly, all other dead cells stay dead.

These simple interactions produce what is called _emergent behavior_, where simple rules create complex results.

<Hint style="info">
  
Check out [Conway's _Game of Life_](/@hash/conways-game-of-life) model in HASH

</Hint>

_Game of Life_ enthusiasts have spent years exploring the search space of the model and its possible creations.

Try playing with the _Game of Life_ HASH model and modifying its initial state \(contained in the `create_gol_grid.js` file\). Some arrangements of agents produce arrangements of agents known as "spaceships" that move across the grid as a group and can even generate new groups of agents.

**What took Conway weeks can now be done in seconds, and with HASH you can set up experiments, run analyses, and leverage the power of** [**cloud computing**](/cloud) **directly in your browser, extending agent-based modeling to real-world problems and scenarios with ease.**
