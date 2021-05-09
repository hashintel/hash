# Context

Besides their [**state**](state.md), an agent always has access to their **context**. The context is the parts of the simulation that the agent is exposed to; another way of thinking about it is that an agent's context are the parts of the simulation that the agent "can see".

The `context` object is passed to each behavior, and it has the following methods:

* `neighbors`
* `messages`
* `globals`
* `data`
* `step`

All values accessed through `context` are _read-only_, and if modified, will not directly change the state of the simulation or any other agent.

## Neighbors

The `context.neighbors()` method returns a collection of the agent's neighbors. The agent must have a `"position"` field defined, and either its own `"search_radius"` field or `globals.json` must have `"search_radius"` defined in the [topology](../configuration/topology/).

{% tabs %}
{% tab title="JavaScript" %}
```javascript
const behavior = (state, context) => {
    for (neighbor of context.neighbors()) {
        pos = neighbor.position;
        // ...
    }
}
```
{% endtab %}

{% tab title="Python" %}
```python
def behavior(state, context):
    for neighbor in context.neighbors():
        pos = neighbor.get("position")
        # ...
```
{% endtab %}
{% endtabs %}

{% hint style="info" %}
An agent can read the state of its neighbors, but agents cannot directly modify another agent's state. However, agents may communicate by [sending messages](../agent-messages/sending-messages.md) to each other.
{% endhint %}

## Messages

The `context.messages()` method returns a collection of messages received by the agent in this step of the simulation. For more details see [Handling Messages](../agent-messages/handling-messages.md).

## Globals

The `context.globals()` method returns an immutable JSON object of the simulation's constants, as defined in `globals.json`. For more details see [Globals](../configuration/).

## Data

The `context.data()` method returns an immutable JSON object of the simulation's datasets that have been added through the "Add to Simulation" toolbar. For more details see [Datasets](../datasets/).

## Step

The `context.step()` method returns the current step number of the simulation. Simulation steps start at the number 1.

{% tabs %}
{% tab title="JavaScript" %}
```javascript
const behavior = (state, context) => {
    console.log("The current step is", context.step())
}
```
{% endtab %}

{% tab title="Python" %}
```python
def behavior(state, context):
    print("The current step is", context.step())
```
{% endtab %}
{% endtabs %}

