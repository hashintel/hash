---
title: 3D
slug: simulation/creating-simulations/views/3d-viewer
objectId: b1a70631-35af-46e7-a1a9-6e66c0031f36
---

# 3D

The 3D viewer in HASH is designed to make viewing simulation data as fast and convenient as possible.

Clicking on any agent in the 3D viewer will open an 'inspector' panel, which provides a number of utilities that help users inspect simulation data.

There are many ways to display information about agents in the 3D viewer directly which can be controlled through various fields on an agent:

- Position
- Direction
- Scale
- Color
- Shape

## Position

An agent's position is given as `[X, Y, Z]`. Using the _Axes Helper_ as a guide, the X axis of the space is follows the red line, the Y axis following the green line, and the Z axis following the blue line. In HASH simulations, the Z axis is always the "up" direction.

## Direction

The rotation of agents can be controlled by setting the "direction" vector of the agent, also given as `[X, Y, Z]`. The displayed agent in the 3D viewer will then point along the direction vector. This doesn't constrain all degrees of freedom, so the rotation about the direction vector is given normal to the ground plane. If the "direction" field is not present, then the "velocity" field will be used instead, defaulting to `[1,0,0]` if neither direction is given.

## Scale

The scale of the agent is simply set by `[X,Y,Z]`. Each value determines how big the agent is drawn in each dimension. The default is `[1,1,1]` . We also provide a shorthand for setting the "height" of an agent, which consists of a visual position shift and Z axis scale. In most cases you won't mix the two, and will choose either height or scale depending on the visualization.

## Color

An agent's color can be set by either setting the "color" field on the agent with any three.js compatible color code \(CSS color codes as an example\). For more granular control, you can also set the "rgb" field on an agent with a 3-wide array of R,G,B on a scale from 0-1.

## Shape

Agents can be represented a huge variety of ways in HASH's 3D viewer, out of the box. Read more about [agent shapes](/docs/simulation/creating-simulations/anatomy-of-an-agent/visualization/shapes).

## Hiding Agents

It's possible to hide agents from the viewer. Simply, set "hidden" to true on the agent state.

## Change the Background

The 3D stage and grid color can be changed and set by clicking on the gear icon in the top right.

![](https://cdn-us1.hash.ai/site/docs/image%20%2868%29.png)
