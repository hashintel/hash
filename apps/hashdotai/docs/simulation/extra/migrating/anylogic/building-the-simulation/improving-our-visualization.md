---
title: Improving our Visualization
slug: simulation/extra/migrating/anylogic/building-the-simulation/improving-our-visualization
objectId: 03f86810-5714-4ab3-a71e-5829698d12ed
---

# Improving our Visualization

Now let's add some more involved visualization to our simulation. Visualizations allow users of your simulation to better understand your model, and includes generating graphs in the **Plots** view, and improving the visuals in the **3D Viewer**.

## Plots

We'll start by defining outputs that track metrics of interest, like the total quantity of crude and refined oil, and the number of gas stations that are empty. We'll use those outputs to generate a few plots of interest.

**analysis.json**

```javascript
"empty_stations": [
  {
    "op": "filter",
    "field": "ordered",
    "comparison": "eq",
    "value": true
  },
  {
    "op": "count"
  }
]
```

![Plots for the Oil Supply Chain model](https://cdn-us1.hash.ai/site/docs/image%20%2827%29.png)

## Advanced Agent Visualizations

### Visualizing Stocks

Let's make it easier to tell how much stock our agents are holding. We'll link the height of the agents to their level of stock, and adjust their scale to improve visibility. We'll have to add these lines of code in different behaviors for each agent, and adjust the specific field names we're accessing.

```javascript
state.set("height", state.get("crude") / 500);
```

### Adding Poly Models

HASH has built in poly models which allow you to more accurately represent many different types of agents. We'll create a dummy agent next to each one we edited in the previous section, and edit the actual **Tanker** and **Truck** agents with a `shape` and a `scale` to size them properly.

<!-- prettier-ignore -->
| Agent | Shape |
| :--- | :--- |
| Tanker | "boat" |
| Port | "cube'" |
| Refinery | "factory" |
| Storage | "silo" |
| Distributor | "silo" |
| Retailer | "store" |
| Truck | "car" |

### Adding Edges

We'll also add edges to help visualize the flows between different agents. Take a look at the docs section on [visualizing networks](/docs/simulation/creating-simulations/anatomy-of-an-agent/visualization/networks) for implementation details.

### Agents in Motion

Both out truck agents and our tankers could look more realistic as they move along their routes. We'll add some logic to ensure that they are facing in the direction they are moving. The code that can help us with that is simply takes the vector difference between the current and next `lng_lat` position:

```javascript
state.set(
  "direction",
  new_lng_lat.map((c, i) => state.get("lng_lat")[i] - c),
);
```
