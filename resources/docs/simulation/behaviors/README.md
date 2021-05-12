---
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

{% hint style="warning" %}
To run your simulation [with hCloud](../h.cloud.md), you'll need to [define Behavior Keys](behavior-keys.md) for each behavior in your simulation.
{% endhint %}

The exact semantics vary by programming language, but in spirit every behavior is a pure function which receives a given agent's state, the world context visible to that agent, and produces its next state.

![During a timestep an agent passes its state and context to its associated behaviors, modifying its state](../.gitbook/assets/untitled-4-.png)

Most behaviors output a single state with the same `agent_id` as they received. For example, the following behavior code causes an agent to move along the x-axis:

{% tabs %}
{% tab title="JavaScript" %}
```javascript
const behavior = (state, context) => {
    state.position[0] += 1;
}
```
{% endtab %}

{% tab title="Python" %}
```python
def behavior(state, context):
    state["position"][0] += 1
```
{% endtab %}
{% endtabs %}

{% hint style="info" %}
Agents can use behaviors to create new agents by sending a message to the special `hash` agent. This is covered more in-depth in [Messages](../agent-messages/built-in-message-handlers.md#creating-agents-via-messages).
{% endhint %}

