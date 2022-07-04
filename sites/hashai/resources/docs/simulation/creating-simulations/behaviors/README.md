---
title: Behaviors
slug: simulation/creating-simulations/behaviors
objectId: 98e7aaf1-5ff1-47a6-bec4-b6bfe7415fd9
description: Giving agents agency and specifying laws of the universe
---

# Behaviors

Agents can \(and typically do\) have behaviors:

```javascript
{
    ...
    behaviors: ['eats_fruit.js', 'messages_friends_fruit.py', 'has_friends.js']
}
```

Behaviors allow agents to exhibit _agency_ in the simulation. An agent can have any number of behaviors.

Behaviors are pure functions in the form of: `(current_state, context) => { // update state }`

<Hint style="warning">
To run your simulation [with hCloud](/docs/simulation/creating-simulations/h.cloud), you'll need to [define Behavior Keys](/docs/simulation/creating-simulations/behaviors/behavior-keys/) for each behavior in your simulation.
</Hint>

The exact semantics vary by programming language, but in spirit every behavior is a pure function which receives a given agent's state, the world context visible to that agent, and produces its next state.

![During a timestep an agent passes its state and context to its associated behaviors, modifying its state](https://cdn-us1.hash.ai/site/docs/untitled-4-.png)

Most behaviors output a single state with the same `agent_id` as they received. For example, the following behavior code causes an agent to move along the x-axis:

<Tabs>
<Tab title="JavaScript" >

```javascript
const behavior = (state, context) => {
  state.position[0] += 1;
};
```

</Tab >

<Tab title="Python" >

```python
def behavior(state, context):
    state["position"][0] += 1
```

</Tab>
</Tabs>

<Hint style="info">
Agents can use behaviors to create new agents by sending a message to the special `hash` agent. This is covered more in-depth in [Messages](/docs/simulation/creating-simulations/agent-messages/built-in-message-handlers#creating-agents-via-messages).
</Hint>
