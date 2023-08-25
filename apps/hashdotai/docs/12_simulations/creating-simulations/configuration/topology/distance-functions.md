---
title: Distance Functions
slug: simulation/creating-simulations/configuration/topology/distance-functions
objectId: f34a19b1-0bd7-44dc-97e0-c371d63ab6c0
description: How far away is one agent from another?
---

# Distance Functions

When finding the neighbors of agents in a simulation, HASH depends on a few important flags to produce accurate results. One such flag is the underlying distance calculations between agents in the simulation. These flags are accessible via topology configuration in properties. The topology field of your `globals.json` file will look something like:

```javascript
{
    "topology": {
        "distance_function": "chebyshev"

        "search_radius": 10
    },
    ...
}
```

## Options

<!-- prettier-ignore -->
| Function Name | Behavior |
| :--- | :--- |
| `chebyshev` | The greatest distance between two points in any axis also known as the L-infinity norm. [Wikipedia](https://en.wikipedia.org/wiki/Chebyshev_distance) |
| `conway` | Same as chebyshev. Named after John Conway because of its use in collecting all 8 neighbors in an [agent's neighborhood](https://en.wikipedia.org/wiki/Conway%27s_Game_of_Life#Rules). |
| `manhattan` | Distance between agents are computed on a grid, where the distance is the total sum of the difference in each of the axes. [Wikipedia](https://en.wikipedia.org/wiki/Taxicab_geometry) |
| `euclidean` | The point-point distance "as the crow flies" between two points [Wikipedia](https://en.wikipedia.org/wiki/Euclidean_distance) |
| `euclidean_squared` | Same as euclidean, but the final square root is not taken. This is useful when for high-performance distance calculations when only order matters. [Wikipedia](https://en.wikipedia.org/wiki/Euclidean_distance#Squared_Euclidean_distance) |

<Hint style="info">
The default distance function is `conway` - make sure to change it depending on your use case!
</Hint>

Currently, HASH doesn't support multiple distance functions in a single simulation.
