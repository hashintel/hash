# Messages

Information in a simulation can propogate in one of two ways - either through neighbors which we cover in [Behaviors](../../behaviors.md) and [Topology](../../configuration/topology/), and through message sharing. 

Messages are a simple yet powerful way of moving data around a simulation and can be used to do things like adding, removing, and collecting data from agents that are not necessarily near each other. 

Agents can create a message to send to either another agent or the simulation engine itself. Here, we send a message to an agent with the name of `schelling`:

{% tabs %}
{% tab title="JavaScript" %}
```javascript
(state, context) => {
    state.messages.push({
        to: "schelling",
        type: "data_point",
        data: {
            num_agents: 50
        }
    });
    return state;
}
```
{% endtab %}

{% tab title="Python" %}
```python
def behavior(state, context):

    message =	{
      "brand": "schelling",
      "type": "data_point",
      "data": {
        "num_agents": 50
      }
    }
    
    state.messages.append(message)

    return state
```
{% endtab %}

{% tab title="Rust" %}
```rust
fn behavior(state: AgentState, context: Context) {
    

}
```
{% endtab %}
{% endtabs %}

 You'll notice that each message is comprised of three fields: "to", "type", and "data." 

* `to`:  the name or ID of the agent that the message will be deliever to
* `type`: the type of message being sent for the message handler to select the right course of action
* `data`: any data you want to send along with the message

Messages are produced during a step, but are not delievered and processed until the next step.

![Data flow for a single step of a HASH simulation](../../.gitbook/assets/image%20%281%29.png)

