---
title: Creator Behaviors
slug: simulation/creating-simulations/anatomy-of-an-agent/creator-behaviors
objectId: 5c121b23-ffea-46b4-a8ab-d9cfdc4bf32e
description: Initializing simulations by using creator behaviors
---

## Creator Agents

<Hint style="warning">
Creator behaviors were commonly used in HASH before the introduction of programmable initial state. We recommend using programmable inital state and the `init` package of the HASH Standard Library instead of creator behaviors for 99% of use cases.
</Hint>

<Hint style="info">
If you want to jump right into code you can take a look at our [Initialization Demo ](/@hash/initialization-demo)which demos creator agents.
</Hint>

With "creator" agents you can create agents that create other agents. For example, by accessing published behaviors, we can very easily generate common agent placements. These behaviors can be found in the lower left corner; search for and then click on them to add them to your simulation:

- `Create Grids (@hash/create-grids/create_grids.js)`: copy an agent to every unit within the [topology](/docs/simulation/creating-simulations/configuration/topology) bounds
- `Create Scatters (@hash/create-scatters/create_scatters.js)`: copy an agent to random locations within the [topology](/docs/simulation/creating-simulations/configuration/topology) bounds
- `Create Stacks (@hash/create-stacks/create_stacks.js)`: copy an agent multiple times to the same location

Take a look at how we can use published behaviors in the following example, where \[rabbits forage for food and reproduce\]\([https://hash.ai/@hash/rabbits-grass-weeds](/@hash/rabbits-grass-weeds), while grass and weeds grow around them:

![](https://cdn-us1.hash.ai/site/docs/image%20%2829%29.png)

There's a singly agent that has a set of behaviors that will reference the "templates" we attached as properties on the creator agent.

`Create Grids` looks at the agent templates in the "grid_templates" array, in this case the "ground". We're copying it to fill the space defined in the bounds of our "topology" field in`globals.json`:

![](https://cdn-us1.hash.ai/site/docs/screen-shot-2020-05-30-at-5.45.24-pm.png)

Next, `Create Scatters` distributes the "rabbits" across the environment. Each one is placed in a random location within the bounds specified in the `topology`.

Now we want to make a few adjustments to the agents we've generated which requires a bit more logic. Luckily for us, HASH behaviors are composable. `Create Grids` and `Create Scatters` have created "agent" objects in our creator and filled them. We access those agents by using the "template_name" as a key:

![](https://cdn-us1.hash.ai/site/docs/image%20%2831%29%20%282%29%20%282%29%20%282%29%20%282%29%20%282%29%20%282%29%20%282%29%20%283%29%20%283%29%20%281%29.png)

Here we've randomly assigned the color of our "ground" agents, and given each of the "rabbits" a random starting amount of energy.

Our creator then runs two more published behaviors. `Create Agents (@hash/create-agents/create_agents.js)` sends messages to the engine to generate every agent in the "agents" object, and `Remove Self (@hash/remove-self/remove_self.js)` gets rid of the "creator" agent, since it's finished all it needs to do. Again, these behaviors can be found in the lower left sidebar.

<Hint style="info">
You can create new agents during your simulation by sending a message to the reserved hash keyword.
</Hint>

<Tabs>
<Tab title="JavaScript" >

```javascript
state.addMessage("hash", "create_agent", {
  ...agent_details,
});
```

</Tab>

<Tab title="Python" >

```python
state.add_message("hash", "create_agent", {
    ...agent_details
 })
```

</Tab>
</Tabs>

If you'd like to explore another simple example that uses these published behaviors, take a look at the [Wildfires](/@hash/wildfires-regrowth) or [Rock, Paper, Scissors](https://core.hash.ai/@hash/rock-paper-scissors/stable) simulations.

<Hint style="info">

If you ever feel like you might be "reinventing the wheel," check out [hIndex](/search?contentType=Behavior&sort=relevance&query=create&page=1). There you'll find hundreds of pre-made, ready-to-use simulation components.

</Hint>
