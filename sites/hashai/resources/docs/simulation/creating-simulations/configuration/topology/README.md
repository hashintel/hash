---
title: Topology
slug: simulation/creating-simulations/configuration/topology
objectId: dceb2b2a-ef0f-4950-9e26-c4ab04f34346
---

# Topology

An important keyword recognized by the [HASH Engine](/platform/engine) (hEngine) is `topology`.

The topology keyword sits at the top level of the `globals.json` file object and drives a handful of important hardware-accelerated calculations used by behaviors in our simulation.

A topology configuration might look like this:

```javascript
{
    "topology": {
        "x_bounds": [0, 20],
        "y_bounds": [0, 20],
        "z_bounds": [0, 20],

        "wrap_x_mode": "continuous",
        "wrap_y_mode": "continuous"

        "wrap_z_mode": "continuous",

        "distance_function": "chebyshev"

        "search_radius": 10
    },
    ...
}
```

Configuring topology properly lets you leverage HASH's built-in hardware acceleration to quickly find neighbors in the simulation, define extents of the simulation area, and navigate an agent from point A to B.

<Hint style="success">
It's best to let HASH do the heavy lifting for you, especially for computationally-intensive work that we've already optimized.
</Hint>

## Nearest-neighbor calculations

**Search Radius**

Internally, hEngine maintains a list of neighbors for each agent and updates the list with each time step. As agents move, their list of neighbors automatically updates - agents further away than a given search radius are removed and agents within the search radius are added. In the properties tab, this can be defined via a "search_radius" keyword:

```javascript
{
    "topology": {
        ...
        "search_radius":10
    }
}
```

Any agents automatically found within the search radius of a given agent can be accessed through the agent's context. In practice, an example agent behavior would look like:

<Tabs>
<Tab title="JavaScript" >

```javascript
function behavior(state, context) {
    const neighbors = context.neighbors()

    for (const neighbor of neighbors) {
        ...
    }

    // OR

    neighbors.forEach(n => {
        ...
    });
}
```

</Tab>

<Tab title="Python" >

```python
def behavior(state, context):
    neighbors = context.neighbors()

    for neighbor in neighbors:
        ...

    # OR

    map(lambda n: ..., neighbors)
}
```

</Tab>
</Tabs>

In addition to being able to set the search radius for all agents in the simulation, it is possible for the user to override the search radius for individual agents. This can be done dynamically but is typically done in the initial state definition.

```javascript
[
  {
    agent_id: 1,
    name: "Eye of Sauron",
    search_radius: 10000000,
  },
];
```

**Distance Functions**

In addition to setting the search radius, it is also possible to set the distance function that the engine uses to compute the distance between agents. This can only be set in the `globals.json` file. The following pre-built distance functions are supported:

- `manhattan` or `taxicab`: L1 norm distance function that return the grid distance between two points
- `euclidean`: L2 norm distance function that returns the direct distance between two points
- `euclidean_squared`: Similar to euclidean but distances are left squared for performance reasons
- `chebyshev` or `conway`: L-infinity norm distance function that return the longest distance in **x**, **y**, and **z**

```javascript
{
    "topology": {
        ...
        "distance_function": "manhattan"
    }
}
```
