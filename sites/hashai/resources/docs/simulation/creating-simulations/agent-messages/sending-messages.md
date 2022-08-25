---
title: Sending Messages
slug: simulation/creating-simulations/agent-messages/sending-messages
objectId: 66ddabba-469f-4e2d-b6cd-1755d0eb9ac7
---

# Sending Messages

## Message Structure

Agents send messages by adding JSON objects to their `messages` array. The object is defined as:

```javascript
{
    to: "string" || "string"[]// an agent_id or agent_name
    type: "string" // a string that defines the type of the message
    data: "any" // an object that serves as the payload
}
```

- **to:** An agent id or an agent name. The agent with the corresponding `agent_id` field or the agent\(s\) with the corresponding `agent_name` field will receive the message in the next time step. If you want to send a message to multiple agents -- multicasting -- you can do so in one of two ways:
  - The "to" field of a message is an array, so you can include multiple agent names and IDs.
  - When sending a message to an `agent_name` that is shared by multiple agents, they will all receive the message. For instance, if five agents have the field `agent_name` set to `"forklift"`, they will all receive a message defined with `to: "forklift"`
- **type:** A user-defined string that serves as metadata for the object, describing the message and/or its purpose.
- **data:** A user-defined object that can contain any arbitrary data.

## Code Examples

<Tabs>
<Tab title="JavaScript" >

```javascript
const behavior = (state, context) => {
  state.messages.push({
    to: "people",
    type: "greeting",
    data: { msg: "hello" },
  });
};
```

</Tab>

<Tab title="Python" >

```python
def behavior:
    state['messages'].append({
        "to": "people",
        "type": "greeting",
        "data": {"msg": "hello"}
    })
```

</Tab>
</Tabs>

<Hint style="info">
We provide helper functions on the state object for adding messages. state.addMessage\(\) and state.add_message\(\), for JavaScript and Python, respectively.
</Hint>

<Tabs>
<Tab title="JavaScript" >

```javascript
const behavior = (state, context) => {
  state.addMessage("people", "greeting", { msg: "hello" });
};
```

</Tab>

<Tab title="Python" >

```python
def behavior:
    state.add_message("people", "greeting", {"msg": "hello"})
```

</Tab>
</Tabs>
