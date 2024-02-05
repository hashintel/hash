---
title: "Physics in HASH"
date: "2021-06-28"
cover: https://imagedelivery.net/EipKtqu98OotgfhvKf6Eew/a1f0bd7b-fb28-451e-e2ef-e5a67f4e2900/public
categories: 
  - "Simulation"
---

We recently released the HASH Physics Library, which provides behaviors that can help you start creating physics simulations in HASH. The library is written in Rust, which means that it's optimized to run in our engine. The HASH docs contain more information about [each of the behaviors](https://docs.hash.ai/core/concepts/physics).

You can add the physics library to your simulation using the Add to Simulation toolbar on the bottom left of hCore.

![](images/image31.png)

Let's look at a few simulations to better understand how to make use of the library:

## A Simple Spring

The key behavior for the physics library is `@hash/physics/forces.rs`. This behavior translates forces exerted onto the object into changes in motion and position. You will typically pair it with other custom or library behaviors which will add forces to the agent.

The `@hash/physics/spring.rs` behavior is a great example of a behavior to pair with `forces.rs`. It simulates the effects of a spring attached between the agent and a neighbor. If we add both behaviors to an agent, and provide it with the proper parameters we should see the agent move in classic periodic motion. Here is the `init.js` file:

```javascript
const init = (context) => {
  const { k, length, damping } = context.globals();
  let agents = [
    {
      "agent_id": "anchor",
      "position": [0, 0, 0]
    },
    {
      "behaviors": ["@hash/physics/spring.rs", "@hash/physics/forces.rs"],
      "position": [4, 0, 0],
      "mass": 10,
      "color": "blue",
      "shape": "sphere",
      "search_radius": 10,
      "springs": [
        {
          "agent_id": "anchor",
          k,
          length,
          damping
        }
      ],
      "network_neighbor_ids": ["anchor"]
    }
  ];
  return agents;
}
```

<iframe src="https://core.hash.ai/embed.html?project=%40hash%2Fhanging-spring&amp;ref=stable&amp;tabs=3d" scrolling="auto" width="700" height="400" frameborder="0"></iframe>

There are three key parameters you can modify for a spring: the resting `length`, the spring constant `k`, and the damping constant `B`. Modify the global variables in the embedded simulation to see the different effects.

## Pendulums

If we increase the value of _k_ for a spring by orders of magnitude, we can use them to simulate rigid rods. The example below is a pendulum which uses a spring for this exact purpose.

To define the pendulum, we've attached an agent with mass to a pivot point. The distance between them is exactly the resting length of the "spring" (since it is mimicking a rigid object). We also need to add one more behavior to the mass agent, one that will simulate the force of gravity and cause it to swing down. The `@hash/physics/gravity.rs` behavior does this. We've simply added it it into the behavior chain, and added a `gravity` constant in **globals.json**. Here is the new agent definition:

```javascript
{
        "behaviors": ["@hash/physics/spring.rs", "@hash/physics/gravity.rs", "@hash/physics/forces.rs"],
        "position": [5, 0, 10],
        "mass": 10,
        "shape": "sphere",
        "force": [0, 0, 0],
        "agent_id": "ball1",
        "network_neighbor_ids": ["ball0"],
        "springs":[{
          "agent_id": "ball0",
          "k": 10000,
          "length": 5
        }]
}
```

<iframe src="https://core.hash.ai/embed.html?project=%40hash%2Fpendulum&amp;ref=stable&amp;tabs=3d" scrolling="auto" width="700" height="400" frameborder="0"></iframe>

We can easily create more complex systems by connecting more mass agents in a similar fashion. Change the slider for the `pendulum_segments` field and reset the simulation to experiment with this.

## Colliding Agents

The final physics behavior to explore is `@hash/physics/collision.rs`. This behavior, like **spring.rs**, handles an interaction between agents. It will cause two agents to bounce off each other if they get too close (within 0.5 units). The collision is perfectly elastic, conserving both momentum and energy. Here is the definition for one of the colliding agents:

```javascript
{
    "shape": "sphere", 
    "color": "blue",
    "behaviors": ["@hash/physics/collision.rs", "@hash/physics/forces.rs", "custom.js"],
    "mass": 10,
    "velocity": [0, 0, 0]
}
```

<iframe src="https://core.hash.ai/embed.html?project=%40hash%2Fcolliding-agents&amp;ref=stable&amp;tabs=3d" scrolling="auto" width="700" height="400" frameborder="0"></iframe>

You can fork and modify any of these simulations, and you can also build your own from scratch by importing the Physics Library. Let us know what you're building on the [HASH Discord](https://discord.gg/BPMrGAhjPh) channel.
