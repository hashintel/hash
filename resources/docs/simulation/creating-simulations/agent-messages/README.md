---
title: Messages
slug: simulation/creating-simulations/agent-messages
objectId: 0d485ed3-efcc-4f4b-a8f0-0d886e688802
---

# Messages

Information in a simulation can propagate in one of two ways - either through neighbors which we cover in [Behaviors](/docs/simulation/creating-simulations/behaviors/) and [Topology](/docs/simulation/creating-simulations/configuration/topology/), or through message passing.

Messages are a simple yet powerful way of moving data around a simulation and can be used to do things like adding, removing, and collecting data from agents that are not necessarily near each other.

Agents send messages by adding them to `state.messages`, and they receive them by checking `context.messages().`

Agents can create a message to send to either another agent or the simulation engine itself. Here, we send a message to an agent with the name of `schelling`:

<Tabs>
<Tab title="JavaScript" >

```javascript
const behavior = (state, context) => {
    state.messages.push({
        to: "schelling",
        type: "data_point",
        data: {
            num_agents: 50
        }
    });
}
```

</Tab >

<Tab title="Python" >

```python
def behavior(state, context):  
  state['messages'].append({
    "to": "schelling",
    "type": "data_point",
    "data": {
      "num_agents": 50
    }
  })
```

</Tab>
</Tabs>

<Hint style="info">
If you want to jump right into code you can take a look at our [Message Passing Colors ](/@hash/message-passing-colors)simulation, which demos message passing among many agents.
</Hint>

You'll notice that each message is comprised of three fields: "to", "type", and "data."

* `to`:  the `agent_name` or `agent_id` of the agent that the message will be deliever to
* `type`: the type of message being sent for the message handler to select the right course of action
* `data`: any data you want to send along with the message

<Hint style="info">
You can use the helper function state.addMessage\(to&lt;String&gt;, type&lt;String&gt;, data&lt;Dict&gt;\) to add messages directly to the state messages field.
</Hint>

<Tabs>
<Tab title="JavaScript" >

```javascript
const behavior = (state, context) => {
    state.addMessage("foo", "bar", {msg: "hello"});
}
```

</Tab >

<Tab title="Python" >

```python
def behavior(state, context):
  state.add_message("foo", "bar", {"msg": "hello"})
```

</Tab>
</Tabs>

Messages are produced during a step, but are not delivered and processed until the next step.

![Data flow for a single simulation step in HASH](https://cdn-us1.hash.ai/site/docs/image%20%2824%29.png)
