---
description: Visualizing network connections between agents in the 3D viewer
---

# Networks

Networks are often found in multi-agent models, and the ability to visualize them can add an additional level of clarity to your model. The best way to visualize networks in HASH right now is to create an agent which represents a "link" or "edge" that connects two other agents. By giving this representative agent a **direction** and a **scale** that makes it thin and long, lines can be drawn between interacting agents.

In this example, bills are being processed and passed around to different employees \(represented by the green agents. Links highlight when a bill is passed along them.

![](../../.gitbook/assets/billing_department_s.gif)

```javascript
// This function returns an "edge" agent that will point from position a to b
function make_edge(a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];

    const dx2 = dx**2;
    const dy2 = dy**2;
    const norm = (dx2 + dy2)**0.5;

    const mid_x = dx/2 + a[0];
    const mid_y = dy/2 + a[1];

    const edge_agent = {
        "scale": [0.05, norm, 0.05],
        "height": 0,
        "position": [mid_x, mid_y],
        "direction": [2*dx, 2*dy],
        "behaviors": ["edge.js"]
    }

    return edge_agent;
}
```

## Examples

Below are a few simulations which use network visualizations. Inspect the relevant code from their behaviors and add it to the models you're building:

{% embed url="https://hash.ai/@hash/oil-supply-chain" caption="" %}

**"edge.js"** and **"create\_pipeline.js"** in the Oil Supply Chain.

**"edge.js"** and **"create\_edges.js"** in the Billing Department.

{% embed url="https://hash.ai/@hash/interconnected-call-center" caption="" %}

**"create\_links.js"** in the Interconnected Call Center.

