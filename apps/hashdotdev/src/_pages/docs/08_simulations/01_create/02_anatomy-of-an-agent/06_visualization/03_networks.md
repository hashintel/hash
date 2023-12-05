---
title: Networks
slug: simulation/creating-simulations/anatomy-of-an-agent/visualization/networks
objectId: 9427eb8c-bdd0-4ed5-b71f-f535ad8c71d9
description: Visualizing network connections between agents in the 3D viewer
---

# Networks

Networks are often found in multi-agent models, and the ability to visualize them can add an additional level of clarity to your model. Edges will automatically be drawn in the 3D Viewer based on the `network_neighbor_ids` field on agents. This field must contain an array composed of the `agent_id`s of other agents in the simulation. Edges will be automatically drawn to the corresponding agents, and updated every time step.

![Edges drawn between agents](https://cdn-us1.hash.ai/site/docs/image%20%2865%29.png)

<Hint style="info">
Network drawing can be toggled by accessing the menu in the top right of the 3D Viewer.
</Hint>

You can take this a step further and use the [Networks Library](/@hash/networks) to provide agents easy access to their network neighbors.

## Edges as Agents

You can also create and visualize networks by creating agents which represent a "link" or "edge" that connects two other agents. By giving this representative agent a **direction** and a **scale** that makes it thin and long, lines can be drawn between interacting agents.

In this example, bills are being processed and passed around to different employees \(represented by the green agents. Links highlight when a bill is passed along them.

![](https://cdn-us1.hash.ai/site/docs/billing_department_s.gif)

```javascript
// This function returns an "edge" agent that will point from position a to b
function make_edge(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];

  const dx2 = dx ** 2;
  const dy2 = dy ** 2;
  const norm = (dx2 + dy2) ** 0.5;

  const mid_x = dx / 2 + a[0];
  const mid_y = dy / 2 + a[1];

  const edge_agent = {
    scale: [0.05, norm, 0.05],
    height: 0,
    position: [mid_x, mid_y],
    direction: [2 * dx, 2 * dy],
    behaviors: ["edge.js"],
  };

  return edge_agent;
}
```

## Examples

Below are a few simulations which use network visualizations. Inspect the relevant code from their behaviors and add it to the models you're building:

<Embed url="https://hash.ai/@hash/oil-supply-chain" caption="" />

**"edge.js"** and **"create_pipeline.js"** in the Oil Supply Chain.

**"edge.js"** and **"create_edges.js"** in the Billing Department.

<Embed url="https://hash.ai/@hash/interconnected-call-center" caption="" />

**"create_links.js"** in the Interconnected Call Center.
