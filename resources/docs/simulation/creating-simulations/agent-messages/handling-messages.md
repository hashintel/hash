---
title: Handling Messages
slug: simulation/creating-simulations/agent-messages/handling-messages
objectId: 115d9a68-381f-4b08-8765-4a17be0a1afe
---

# Handling Messages

**What happens when an agent receives a message?**

The Context passed to every agent provides a list of messages in the agent's inbox accessible via the `context.messages()` function. Here we can iterate through the list of messages sent to the agent and use that information to make decisions or change state. Note that the `to` field has been replaced by `from`.

```javascript
context {
    messages(): [
        {
            "from": "string" // uuid of agent who sent the message
            "type": "string" // describing contents or purpose
            "data": "any" // additional data contained in the message
        }
    ],
}
```

It's best to think of the `messages` field like a mailbox.

- When **sending** a message, we put the message in the outbox under the `messages` field on **state**.
- When **receiving** a message, it will show up in our inbox, under the `messages` field on **context**.

Notice the distinction. Context is immutable and any accidental changes made to it will not propagate.

<Hint style="info">
Send messages by adding them to the `state.messages` array and access incoming ones through `context.messages()`.
</Hint>

Handling the messages here would be pretty simple - just iterating through the messages array in context.

<Tabs>
<Tab title="JavaScript" >

```javascript
const behavior = (state, context) => {
    for (const message of context.messages()) {
        ...
    }

    // OR

    context.messages().forEach(m => {
        ...
    })
}
```

</Tab>

<Tab title="Python" >

```python
def behavior(state, context):
    for message in context.messages():
        ...
```

</Tab>

<Tab title="Rust" >

```rust
fn (state: AgentState, context: &Context) -> AgentState {
    context.messages()
           .iter()
           .map(|m: &Message| {...});
}
```

</Tab>
</Tabs>

The messages that an agent receives are only available on the timestep they received them. `context.messages()` is cleared between timesteps, so an agent will need to store the messages on their state if they want to preserve a message.
