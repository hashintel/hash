---
title: Neighbors
slug: simulation/creating-simulations/libraries/hash/neighbors
objectId: c1c7f910-08cb-4d8f-a5ef-60a4c1c76ab1
---

# Neighbors

## `neighborsOnPosition(agentA, neighbors)`

This function returns all neighbors that share the same position as `agentA`. The current agent's `state` can be passed in as `agentA`, and dummy agents can be used as well.

<Tabs>
<Tab title="JavaScript">

```javascript
function behavior(state, context) {
  // Find neighbors on my position
  const neighbors = context.neighbors();
  const cohabitators = hstd.neighborsOnPosition(state, neighbors);

  // Create an adjacent "agent"
  let adjPos = state.position;
  adjPos[0] += 1;

  // Find the agents adjacent to me
  const adjacents = hstd.neighborsOnPosition({ position: adjPos }, neighbors);
}
```

</Tab>
<Tab title="Python">

```python
import hstd

def behavior(state, context):
    # Find neighbors on my position
    neighbors = context.neighbors()
    cohabitators = hstd.neighbors_on_position(state, neighbors)

    # Create an adjacent "agent"
    adj_pos = state['position']
    adj_pos[0] += 1

    # Find the agents adjacent to me
    adjacents = hstd.neighbors_on_position({ 'position': adj_pos }, neighbors)
```

</Tab>
</Tabs>

## `neighborsInRadius(agentA, neighbors, max_radius, min_radius, z_axis)`

This function returns all neighbors within the specified radii. The current agent's `state` can be passed in as `agentA`, and dummy agents can be used as well. By default the max and min radii are \[1, 0\]. `z_axis` is false by default, but by passing true you can enable search in a spherical, as opposed to circular radius.

<Tabs>
<Tab title="JavaScript">

```javascript
function behavior(state, context) {
  // Count the number of electrons close to me
  const electrons = context
    .neighbors()
    .filter((n) => n.agent_type === "electron");
  const close_electrons = hstd.neighborsInRadius(
    state,
    electrons,
    2,
    0,
    true,
  ).length;
}
```

</Tab>
<Tab title="Python">

```python
import hstd

def behavior(state, context):
    # Count the number of electrons close to me
    electrons = list(filter(lambda x: x['agent_type'] == 'electron', context.neighbors))
    close_electrons = len(hstd.neighbors_in_radius(state, electrons, 2, 0, True))
```

</Tab>
</Tabs>

## `neighborsInFront(agentA, neighbors, colinear)`

This function returns all neighbors located in front of an agent. `agentA` must have a "direction" property since "in front" is determined by the plane perpendicular to that vector. `colinear` defaults to false, but by passing true the function will only return agents on the same _line_ as the "direction". The current agent's `state` can be passed in as `agentA`, and dummy agents can be used as well.

<Tabs>
<Tab title="JavaScript">

```javascript
function behavior(state, context) {
  const neighbors = context.neighbors();

  // Check which of my neighbors I can see "in front" of me
  const visibleAgents = hstd.neighborsInFront(state, neighbors);

  // Check which agents are in front of one of my neighbors
  const neighborFront = hstd.neighborsInFront(neighbors[0], neighbors);
}
```

</Tab>
<Tab title="Python">

```python
import hstd

def behavior(state, context):
    neighbors = context.neighbors()

    # Check which of my neighbors I can see "in front" of me
    visible_agents = hstd.neighbors_in_front(state, neighbors)

    # Check which agents are in front of one of my neighbors
    neighbor_front = hstd.neighbors_in_front(neighbors[0], neighbors)
```

</Tab>
</Tabs>

## `neighborsBehind(agentA, neighbors, colinear)`

This function returns all neighbors located behind the agent. It functions identically to **neighborsInFront** but returns agents behind the plane of `agentA`. The current agent's `state` can be passed in as `agentA`, and dummy agents can be used as well.

<Tabs>
<Tab title="JavaScript">

```javascript
function behavior(state, context) {
  const neighbors = context.neighbors();

  // Check which of my neighbors are tailing me
  const tailingAgents = hstd.neighborsBehind(state, neighbors, true);

  // Check if my neighbor is being tailed
  const neighborTail = hstd.neighborsBehind(neighbors[0], neighbors, true);
  const neighborTailed = neighborTail.length > 0;
}
```

</Tab>
<Tab title="Python">

```python
import hstd

def behavior(state, context):
    neighbors = context.neighbors()

    # Check which of my neighbors are tailing me
    tailing_agents = hstd.neighbors_behind(state, neighbors, True)

    # Check if my neighbor is being tailed
    neighbor_tail = hstd.neighbors_behind(neighbors[0], neighbors, True)
    neighbor_tailed = len(neighbor_tail) > 0
```

</Tab>
</Tabs>
