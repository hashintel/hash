---
description: Where simulated life begins
---

# Initializing Agents

All HASH simulations begin life in the `init.json` file found in the root of a HASH project. In this file we generate the starting state, or _initial conditions_ of the simulated world.

There are two ways to populate an `init.json` file. You can:

1. explicitly define the individual agents that will be in your model; or
2. define "creator" agents with behaviors that will generate more complex initial states. You can do this with published behaviors, or create your own.

{% embed url="https://youtu.be/AyKYRX1zyjA" caption="" %}

Here's what explicitly defining your agents might look like:

![Defining five agents in init.json](../.gitbook/assets/screen-shot-2020-05-30-at-5.41.03-pm.png)

With "creator" agents you can initialize more dynamic models.

{% hint style="info" %}
If you want to jump right into code you can take a look at our [Initialization Demo ](https://hash.ai/@hash/initialization-demo)which demos creator agents.
{% endhint %}

For example, by accessing published behaviors, we can very easily generate common agent placements. These behaviors can be found in the lower left corner; search for and then click on them to add them to your simulation:

* `Create Grids (@hash/create-grids/create_grids.js)`:  copy an agent to every unit within the [topology](https://docs.hash.ai/core/configuration/topology) bounds
* `Create Scatters (@hash/create-scatters/create_scatters.js)`: copy an agent to random locations within the [topology](https://docs.hash.ai/core/configuration/topology) bounds 
* `Create Stacks (@hash/create-stacks/create_stacks.js)`: copy an agent multiple times to the same location

Take a look at how we can use published behaviors in the following example, where \[rabbits forage for food and reproduce\]\([https://hash.ai/@hash/rabbits-grass-weeds](https://hash.ai/@hash/rabbits-grass-weeds), while grass and weeds grow around them:

![](../.gitbook/assets/image%20%2829%29.png)

There's a singly agent that has a set of behaviors that will reference the "templates" we attached as properties on the creator agent.

`Create Grids` looks at the agent templates in the "grid\_templates" array, in this case the "ground". We're copying it to fill the space defined in the bounds of our "topology" field in`globals.json`:

![](../.gitbook/assets/screen-shot-2020-05-30-at-5.45.24-pm.png)

Next, `Create Scatters` distributes the "rabbits" across the environment. Each one is placed in a random location within the bounds specified in the `topology`.

Now we want to make a few adjustments to the agents we've generated which requires a bit more logic. Luckily for us, HASH behaviors are composable. `Create Grids` and `Create Scatters` have created "agent" objects in our creator and filled them. We access those agents by using the "template\_name" as a key:

![](../.gitbook/assets/image%20%2831%29%20%282%29%20%282%29%20%282%29%20%282%29%20%282%29.png)

Here we've randomly assigned the color of our "ground" agents, and given each of the "rabbits" a random starting amount of energy.

Our creator then runs two more published behaviors. `Create Agents (@hash/create-agents/create_agents.js)` sends messages to the engine to generate every agent in the "agents" object, and `Remove Self (@hash/remove-self/remove_self.js)` gets rid of the "creator" agent, since it's finished all it needs to do. Again, these behaviors can be found in the lower left sidebar.

{% hint style="info" %}
You can create new agents during your simulation by sending a message to the reserved hash keyword.
{% endhint %}

{% tabs %}
{% tab title="JavaScript" %}
```javascript
state.addMessage("hash", "create_agent", {
    ...agent_details
 })
```
{% endtab %}

{% tab title="Python" %}
```python
state.add_message("hash", "create_agent", {
    ...agent_details
 })
```
{% endtab %}
{% endtabs %}

If you'd like to explore another simple example that uses these published behaviors, take a look at the [Wildfires](https://hash.ai/@hash/wildfires-regrowth) or [Rock, Paper, Scissors](https://core.hash.ai/@hash/rock-paper-scissors/stable) simulations.

{% hint style="info" %}
If you ever feel like you might be "reinventing the wheel," check out [hIndex](https://hash.ai/search?contentType=Behavior&sort=relevance&query=create&page=1). There you'll find hundreds of pre-made, ready-to-use simulation components.
{% endhint %}

