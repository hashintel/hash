---
title: Spatial
slug: simulation/creating-simulations/libraries/hash/spatial
objectId: 3b8ec1aa-6569-45dd-860e-2a52692ab603
---

# Spatial

## distanceBetween(agentA, agentB, distanceFunction)

This function returns the distance between two agents, using a specific distance function. You can pass the current agent's `state` as one of the agents. The different distance functions are:

- [Euclidean](https://en.wikipedia.org/wiki/Euclidean_distance) (default)
- [Manhattan](https://en.wikipedia.org/wiki/Taxicab_geometry)
- [Euclidean Squared](https://en.wikipedia.org/wiki/Euclidean_distance#Squared_Euclidean_distance)
- [Chebyshev](https://en.wikipedia.org/wiki/Chebyshev_distance)

<Tabs>
<Tab title="JavaScript">

```javascript
function behavior(state, context) {
  const { neighborA, neighborB } = context.neighbors();

  // Find the closest of 2 neighbors to you
  const distanceToA = hstd.distanceBetween(state, neighborA);
  const distanceToB = hstd.distanceBetween(state, neighborB);
  state.closest = distanceToB > distanceToA ? "A" : "B";

  // Check if neighbors are closer to each other than to you
  const neighborDistance = hstd.distanceBetween(neighborA, neighborB);
  const selfDistance = state.closest === "A" ? distanceToA : distanceToB;

  state.closer_to_neighbors = selfDistance < neighborDistance;
}
```

</Tab>
<Tab title="Python">

```python
import hstd

def behavior(state, context):
    neighbor_a = context.neighbors()[0]
    neighbor_b = context.neighbors()[1]

    # Find the closest of 2 neighbors to you
    distance_to_a = hstd.distance_between(state, neighbor_a)
    distance_to_b = hstd.distance_between(state, neighbor_b)
    state['closest'] = 'A' if distance_to_b > distance_to_a else 'B'

    # Check if neighbors are closer to each other than to you
    neighbor_distance = hstd.distance_between(neighbor_a, neighbor_b)
    self_distance = distance_to_a if state.closest == 'A' else distance_to_b

    state.closer_to_neighbors = self_distance < neighbor_distance
```

</Tab>
</Tabs>

## normalizeVector(vec)

This function returns the unit vector of the `vec` array. You can use it to normalize an agent's direction vector after it's modified.

<Tabs>
<Tab title="JavaScript">

```javascript
function behavior(state, context) {
  const dir = state.direction;

  // Modify the direction by adding a vector [1, 2, 0]
  dir[0] += 1;
  dir[1] += 2;

  // Turn it back into a unit vector
  state.direction = hstd.normalizeVector(dir);
}
```

</Tab>
<Tab title="Python">

```python
import hstd

def behavior(state, context):
    d = state['direction']

    # Modify the direction by adding a vector [1, 2, 0]
    d[0] += 1.0
    d[1] += 2.0

    # Turn it back into a unit vector
    state['direction'] = hstd.normalize_vector(d)
```

</Tab>
</Tabs>

## randomPosition(topology, z_plane)

This function returns a random integer position within the bounds of the `topology`. The Topology should be user-defined in **globals.json** \(see [Topology](/docs/simulation/creating-simulations/configuration/topology/)\). By default`z_plane` is `false` and the returned position is in a 2D plane. Pass true to return a position in 3D space.

<Tabs>
<Tab title="JavaScript">

```javascript
function behavior(state, context) {
  // Move to a random position
  const topology = context.globals().topology;
  const new_pos = hstd.randomPosition(topology);

  state.position = new_pos;
}
```

</Tab>
<Tab title="Python">

```python
import hstd

def behavior(state, context):
    # Move to a random position
    topology = context.globals()['topology']
    new_pos = hstd.random_position(topology)

    state['position'] = new_pos
```

</Tab>
</Tabs>
