---
description: The beating hearts of agent-based models
---

# Agents

As the name suggests, **agents** lie at the heart of _agent_-_based_ modeling. Agents are made up of State, Behaviors, and Context.

{% embed url="https://youtu.be/PTW6R-PrT38" caption="Anatomy of an Agent" %}

Every agent has a name and a unique identifier. As a simulation creator, you can set and change the `agent_name` and you can set the `agent_id`before the agent is initialized, but you can't change the agent\_id after the simulation has started. 

{% hint style="info" %}
The HASH Engine by default will set the `agent_id`, so don't worry about setting it manually unless you have a particular need for an agent's id [value in the sim logic](../libraries/hash/agent.md#generateagentid).
{% endhint %}

{% tabs %}
{% tab title="JavaScript" %}
```javascript
const agent = {
    agent_id: <uuid v4>, // Set on_create by the hEngine
    agent_name: <string>
}
```
{% endtab %}

{% tab title="Python" %}
```python
agent = {
    agent_id = <uuid v4> #Set on_create by the hEngine
    agent_name = <string>
}
```
{% endtab %}
{% endtabs %}

Naming your agent is entirely optional. The simplest possible agent is simply `{}` \(although it won't do much of anything!\)

An individual agent has a [state](state.md) and a [context](context.md).

![An Agent](../../.gitbook/assets/image%20%2814%29.png)

When we define the [initial conditions](initial-state.md) of a simulation, we're defining the initial agents that will be present in the first timestep of the simulation, each of which will have its own state and context.

![Three agents, ready to simulate.](../../.gitbook/assets/image%20%2813%29.png)

