---
title: Handling Messages
slug: simulation/creating-simulations/agent-messages/handling-messages
objectID: 9163334b-f855-45bc-aaad-450b1c8a49fa
---

# Handling Messages

**What happens when an agent receives a message?**

Context passed to every agent provides a list of messages in the agent's inbox accessible via the `context.messages` function. Here we can iterate through the list of messages sent to the agent and make some decisions.

```javascript
context {
    messages(): [
    /*  
        Any messages sent to the given agent on this step.
        If the agent wants to preserve access to these on future steps,
        they'll need to store them in their own state.
    */
    ],
    /* other context values to come. */
}
```

It's best to think of the `messages` field like a mailbox.

* When **sending** a message, we put the message in the outbox  under the `messages` field on state.
* When **receiving** a message, it will show up in our inbox, under the `messages` field on context.

Notice the distinction. Context is immutable and any accidental changes made to it will not propagate.

<Hint style="info">
Send messages with `state.messages`and receive them with `context.messages()`.
</Hint>

Handling the messages here would be pretty simple - just iterating through the messages array in context.

<Tabs>
<Tab title="JavaScript" >


```javascript
const behavior = (state, context) => {
    for (const message in context.messages()) {
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

<Tabs>
<Tab title="JavaScript" >


```javascript
const behavior = (state, context) => {
    for (const message of context.messages()) {
        // ...
    }

    // OR

    context.messages().forEach(m => {
        // ...
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
</Tabs>

The messages that an agent receives are only available on the timestep they received them. `context.messages()` is cleared between timesteps, so an agent will need to store the messages on their state if they want to preserve a message.

