---
title: Bounds and Wrapping
slug: simulation/creating-simulations/configuration/topology/bounds-and-wrapping
objectId: 8ecc00e9-25de-43be-ad10-900e51bd2ad3
---

# Bounds and Wrapping

Often, you don't want your agents to move ad infinitum. You might be simulating gas particles in a closed box, or flights across the globe. In these situations, you need to define how big the world is, and how the agent operates as it nears the borders.

A gas particle in a box might have a topology configuration like:

```javascript
{
    "topology": {
        "x_bounds": [0, 20],
        "y_bounds": [0, 20],
        "z_bounds": [0, 20],
        "wrapping_preset": "reflection"
    }
}
```

Notice the `"wrapping_preset": "reflection"` - this tells us that the agent will bounce off the borders, similar to how a ball might be reflected against a wall. If the agent has a direction, the direction will be flipped. This isn't always perfect though, so try to move the agent only once per chain of behaviors.

<Hint style="info">
Play around with the wrapping preset and bounds in [this HASH Simulation](/@hash/wrapping-preset-playground)
</Hint>

The wrapping presents we support out-of-the box are:

<!-- prettier-ignore -->
| Wrapping Preset | Effect |
| :--- | :--- |
| Spherical | Agents will be wrapped continuously along the x-axis and will be reflected against the Y-axis borders. Imagine flying across a map of the world. |
| Reflection | Agents are simply bounced off the border and have their direction flipped |
| Torus | Like the classic arcade games Asteroids and Pacman, agents will be wrapped continuously on both borders. This only applies to the X and Y axis |
| Continuous | Like Torus, but applies in all three dimensions, X, Y, and Z. |
