---
title: Wrapping Presets and Flags
slug: simulation/creating-simulations/configuration/topology/wrapping-presets-and-flags
objectId: 1e6551fa-f571-448d-a5f6-6327a0674ab8
description: Granular control of how the world is presented to hCore
---

# Wrapping Presets and Flags

In [Bounds and Wrapping](/docs/simulation/creating-simulations/configuration/topology/bounds-and-wrapping) we showed how you could set wrapping presets to determine how the topology of the simulation works. Here, we'll show some flags to get even more granular control of HASH's topology engine.

Each pair of borders share a specific wrapping behavior. This could be any one of:

- `continuous` : Pacman-style wrapping where the agent is teleported to the opposite border
- `reflection`: Agents are bounced off against borders
- `offset_reflection`: Agents are reflected and shifted halfway along the border
- `torus`: Like the classic arcade games Asteroids and Pacman, agents will be wrapped continuously on both borders. This only applies to the X and Y axis

These parameters are set in the `globals.json:`

```javascript
{
  "topology": {
    "x_bounds":[-30, 30],
    "y_bounds":[-30, 30],
    "z_bounds":[-15, 15],
    "wrap_x_mode": "continuous",
    "wrap_y_mode": "continuous",
    "wrap_z_mode": "reflection",
  }
}
```

<Hint style="warning">
Note that `offset_reflection` is a special case and is not supported for the Z axis - it will only infer shifts along either the X or Y axes.
</Hint>
