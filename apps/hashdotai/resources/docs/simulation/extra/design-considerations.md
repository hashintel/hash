---
title: Design Considerations
slug: simulation/extra/design-considerations
objectId: 0fd004a1-84fb-4974-94ee-2b3144d74be6
description: Important considerations to keep in mind when building your simulation
---

# Design Considerations

## Actor Model

HASH is designed around an [actor oriented programming model](https://hash.ai/glossary/actor-model#What-is-actor-based-simulation?). Each agent in a simulation is an actor with its own private state. The only way one actor affects another actor is through sending messages.

This is key to handling the computational complexity of large simulations as it removes the need for lock-based synchronization and it makes designing simulations easier. You can trust that an agent's state will only be changed by that agent, so you can cleanly separate the input and outputs of an agent - its message handling - from the agents internal behaviors.

## Timing and Race Conditions

HASH avoids race conditions through isolation of state. Agents calculating the next step \(t + 1\) are only able to use the information they currently have available to them; the state and context from the current step \(t\). Because each agent has a private state HASH won't run into merge conflicts - only one thing, the agent itself, can change its state.

The updates that will create t + 1 are applied synchronously. Messages are collected and distributed by the engine between t and t+1.

There won't be a situation where the order in which an agent is run affects the next state of the simulation. However you might encounter something like a race condition if you don't take into account the "travel time" of messages.

Since HASH implements an actor oriented paradigm, information is sent between agents through messages. If on timestep 1 Agent A sends Agent B a message, Agent B will receive it and be able to act on the message in timestep 2. The earliest Agent A could receive a response is in timestep 3.

![](https://cdn-us1.hash.ai/site/docs/image%20%2815%29.png)

You can run into trouble with a naive message sending pattern where an agent sends messages until it receives a response.

```javascript
// Potentially Bad

function behavior(state, behavior) {
  if (!receivedResponse) {
    sendStateChangeMessage();
  }
}
```

This would send a message on timestep 1 and timestep 2, and if the message was prompting Agent B to make a change to its state, you might inadvertently apply an update twice.

You can avoid this in several ways, including modifying Agent A's send behavior to only send every n timesteps, or modifying Agent B such that the effect is the same whether it receives one or many messages \(e.g. an idempotent messaging pattern\).

One other potential pitfall is forgetting that behaviors run in sequential order. So if in Behavior A you send a message and in Behavior B you check if you received a message and set receivedRespone = True, if the agents behavior array is:

```javascript
["behaviorA", "behaviorB"];
```

a message would be sent before the agent checks if they've received a response.
