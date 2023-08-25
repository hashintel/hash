---
title: Visualization
slug: simulation/creating-simulations/anatomy-of-an-agent/visualization
objectId: 2b67bcfb-525f-4f39-951c-fc98ee009384
---

# Visualization

Once you've developed and tested the logic and functioning of your model, it can be helpful to create a compelling visualization that clearly turns your model into an explanatory tool.

**Agents have some predefined properties that allow you to modify their display in hCore's 3D spatial view:**

- `"shape": string` - if provided overrides the default "box" visualization for the agent.
  - There are built-in geometric shapes and 3D models. See the [Shapes](/docs/simulation/creating-simulations/anatomy-of-an-agent/visualization/shapes) page for more information
- `"height": number` - if provided \(and agent is rendering on a 2d grid\), will set the display height of the agent.
- `"scale": [number, number, number]` - if provided, will re-render the agent in 3d space with the new scale, with \[1, 1, 1\] being the default. The position of the agent will remain the same \(e.g. for neighbor calculations\).
- `"direction": [number, number, number]` - if an agent's shape is a 3D model, or asymmetric, the direction given will affect the agent's visualization.
- `"color": string` - if provided, will color the agent. Named colors \("red", "green", "blue", etc.\) are supported, alongside hex color codes \(`#223344`\) and RGB values \(`rgb(12,244,155)`\).
- `"rgb": [number, number, number]` - an alternate way to color an agent by providing RGB values from 0 - 255.
  - This will be overridden if the "color" field is also set on an agent.
- `"hidden": boolean` - if provided and true, the agent will not be rendered on the 3d viewer.

In the [hIndex](/search?query=display&sort=relevance&page=1) you can find published behaviors which have been created to help with more complicated visualization tasks.

<Hint style="info">
Not all models lend themselves well to spatial representation, and when viewing the results of multiple simulation runs at once \(as part of an [experiment](/docs/simulation/creating-simulations/experiments/)\), it can be more useful to create [analysis charts and graphs](/docs/simulation/creating-simulations/views/analysis/).
</Hint>
