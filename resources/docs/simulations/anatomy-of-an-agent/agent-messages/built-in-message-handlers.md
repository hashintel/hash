---
description: Add and remove agents by interacting with hCore
---

# Built-in message handlers

In addition to the custom messages you can send between individual agents in the simulation, hCore has a set of built-in messages that enable more advanced functionality.

Currently, the most powerful built-in message handlers allow agents to add or remove other agents from the simulation. These messages must be sent to `hash` to get processed by hCore. If not, they will be directed to an agent with a matching ID/name, and you will be very confused. If the agent with a matching name doesn't exist, the message goes unsent and nothing will happen. Again, you will be very confused.

### Removing Agents via Messages

Any agent can remove any other agent with a special message sent directly to `hash`. Here, we remove an agent with the agent\_id of `Bill`. Before the next step starts executing, the message will be processed and `Bill` will be removed \(sorry Bill!\). 

{% hint style="warning" %}
Do note that **case sensitivity** **matters**. If a message is sent to `bill`, it will not get sent to `Bill`.
{% endhint %}

{% tabs %}
{% tab title="JavaScript" %}
```javascript
(state, context) => {
    state.messages.push({
        to: "hash",
        type: "remove_agent"
        data: { agent_id: "Bill" },
    });
    return state;
}
```
{% endtab %}

{% tab title="Python" %}
```

```
{% endtab %}

{% tab title="Rust" %}
```

```
{% endtab %}
{% endtabs %}

However, our goal is to prevent you from shooting yourself in the foot, so any message sent to hASh, Hash, HASH, haSh, etc. will all get forwarded straight to `hash`. This is the only exception to the rule!

If a "remove\_agent" message gets sent without a specified agent\_id, then the agent\_id defaults to that of the sender. Of course, we suggest including setting the field as  `state.agent_id`  for readability but it can be used as shorthand.

### Creating Agents via Messages

Any agent can also create new agents. Any message sent to `hash` with the `create_agent` type will result in the engine spawning a new agent. By default this agent will lack position or direction, and the engine will not try to place the agent for you. 

Here, anything in the data field will be used to create the new agent. The `newborn` behavior is given to this agent, but remember, it will not be run until the next step.

{% tabs %}
{% tab title="JavaScript" %}
```javascript
(state, context) => {
    state.messages.push({
        to: "hash",
        type: "create_agent",
        data: {
            parent: state.agent_id, 
            behaviors: ["newborn"]
        }
    });
    return state;
}
```
{% endtab %}

{% tab title="Python" %}
```

```
{% endtab %}

{% tab title="Rust" %}
```

```
{% endtab %}
{% endtabs %}







