---
title: Environment Setup
slug: simulation/tutorials/phase-1-building-a-simple-hotelling-model-in-2d/set-up-environment
objectId: 91bc373a-7049-4375-ac7d-31fa440ca059
---

# Environment Setup

After opening up a new simulation in HASH, navigate to globals.json. First, we are going to set up the [**Topology**](/docs/simulation/creating-simulations/configuration/topology), or the environment, of the model.

<Tabs>
<Tab title="globals.json" >

```javascript
{
  "topology": {
    "x_bounds": [
      0,
      10
    ],
    "y_bounds": [
      0,
      10
    ],
    "search_radius": 15
  }
}
```

</Tab>
</Tabs>

Setting the x_bounds and y_bounds creates a 10x10 boundary within the environment which will be used to generate the customer and business agents. This code also sets the search_radius of all agents in the simulation to 15, which will automatically update an agent’s neighbor list to include all agents within a distance of 15.
