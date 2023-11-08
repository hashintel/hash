---
title: State
slug: simulation/creating-simulations/anatomy-of-an-agent/state
objectId: 3d62b426-d773-4982-9b3c-6b20a270b564
---

# State

Every agent has a private **state**. Is the agent of height 1 or height 2? Is the agent's name "foo" or is its name "bar"? These properties are expressed and saved on the agent's state.

Your agents can have any fields you want. Here's an agent that uses the Monte-Carlo method to approximate the value of pi via randomness:

```javascript
// LeaderAgent
{
    agent_name: "leader",
    behaviors: ["spawn_samples.js", "estimate_pi.js"],
    spawned_datapoints: 0,
    neighbor_points: 0,
    pi_estimate: 0,
    position: [0, 0, 0],
    search_radius: 1,
}
```

Notice how we use multiple custom fields to store data in the agent.

## Getting and Setting State

The state object can be accessed as an object in JavaScript or a dictionary in Python.

- `state.field_name` : access and edit the value of the field in JavaScript
- `state['field_name']` : access and edit the field in Python

**Example**:

This behavior takes in the current state and [context](/docs/simulation/creating-simulations/anatomy-of-an-agent/context) of the agent, adds 1 to the age property stored on the state, and then returns the state.

<Tabs>
<Tab title="JavaScript" >

```javascript
const behavior = (state, context) => {
  state.age += 1;
};
```

</Tab>

<Tab title="Python" >

```python
def behavior(state, context):
  state['age'] += 1
```

</Tab>
</Tabs>

Important: Only the agent can modify its own state. If an agent wants to prompt another agent to perform a state change, it can send a [message](/docs/simulation/creating-simulations/agent-messages/) to trigger an update.

<Hint style="info">
Agents can read one another's state - for example if agent "foo" is a [neighbor](/docs/simulation/creating-simulations/anatomy-of-an-agent/context) of agent "bar", agent "bar" can access the fields of agent "foo", it just can't make any changes to those fields. That's what makes the state _**private**_.
</Hint>

### Reserved Fields

While an agent can store arbitrary data in its own state, some state values have special meaning in HASH. The fields below are all reserved, in addition to fields tied to visualization which can be found [here](/docs/simulation/creating-simulations/anatomy-of-an-agent/visualization/).

We've suggested ranges of values for you to start off with as you're getting to know HASH

```javascript
{
  // Auto-created identifier. Agents receive messages addressed to their ID
  "agent_id": string,

  // Optional identifier. Agents receive messages that are addressed to their name
  "agent_name": string,

  // Filenames of the behaviors that the agents run to advance
  // their state every simulation step
  "behaviors": [],

  // Contains outbound messages from the agent
  "messages": [],

  // Displays agents in the viewer and used to calculate neighbors
  // Suggested values: [-10, -10, -10] to [10, 10, 10]
  "position": [x, y, z],

  // Agents within the search-radius are considered its neighbors
  // Suggested values: 0 to 10
  "search_radius": number,

  // Can be used for custom movement logic. Will affect the agent's visualization
  // Suggested values: 0 to 1 for each axis
  "direction": [x, y, z],

  // Can be used for custom movement logic. Will affect the agent's visualization
  // Suggested values: 0 to 1 for each axis
  "velocity": [x, y, z],

  // Color of the agent
  "color": string,

  // Color of the agent represented as an rgb array. RGB values are 0 to 255
  "rgb": [r, g, b],

  // Height of the agent in the 3D Viewer
  // Suggested values: 0.1 to 10
  "height": number,

  // Agent model will be scaled along the corresponding axes
  // Suggested values: [1, 1, 1] to [5, 5, 5]
  "scale": [x, y, z],

  // Determines the shape of the agent in the 3D Viewer.
  "shape": string,

  // Determines whether the agent is hidden in the 3D Viewer.
  "hidden": boolean,

  // Used by the agent whenever it passes topology boundaries.
  "position_was_corrected": boolean ,
}
```

### Get and Set

Additionally, we provide helper methods for **getting** and **setting** a property on an agent when you want to **deep-copy** a property / value.

<Tabs>
<Tab title="JavaScript" >

```javascript
let foo = state.get("field_name");
state.set("field_name", "value");
```

</Tab>

<Tab title="Python" >

```python
foo = state.get("field_name")
state.set("field_name", "value")
```

</Tab>
</Tabs>

state.get will deep copy a value from the field into the local scope of the behavior, and set will take a value and deep copy it into the field property. There are cases where this is helpful, but it's a more computationally expensive operation to perform.

<Hint style="info">
You might see state.get and state.set used frequently in older simulations or tutorials - these methods used to be the primary means of getting and setting state properties, but have largely been **deprecated** in favor of`state.field_name` and `state['field_name'].`
</Hint>
