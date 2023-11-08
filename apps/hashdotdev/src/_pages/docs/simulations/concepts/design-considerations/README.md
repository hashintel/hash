---
title: Actor Model
slug: simulation/concepts/design-considerations
objectId: d36e9198-f292-4e12-8dbb-7c7f937a7306
description: >-
  Understanding how agents communicate, influence the world and resolve
  conflicts
---

# Actor Model

## Actors and Messaging

In HASH, agents interact and change the world using an 'actor model', where each agent is an actor. This means that:

- **Each agent has its own private** [**state**](/docs/simulation/creating-simulations/anatomy-of-an-agent/state): an agent can only change its own state. No other agent can reach in from outside and change it directly. They must send a message instead.
- **Agents communicate by sending and receiving** [**messages**](/docs/simulation/creating-simulations/agent-messages/): these messages might include requests, information, or responses to earlier messages. Messages are how agents influence the world around them.

At the beginning of each time step, agents have an inbox of messages sent from other agents: a queue of requests, instructions, responses, and so on. In their [**behaviors**](/docs/simulation/creating-simulations/behaviors/), they check these messages, and in response can do one or both of:

- **Update their private state**: e.g. reduce their stock if they have received a message with an order they can fulfil, or increase their stock if they have received a message confirming delivery of stock.
- **Queue a message to send to another agent**: e.g. confirming that the order has been fulfilled, or requesting further delivery of stock. This message is available to the receiving agent on the next time step.

This process happens in private: given the same inbox, starting [**state**](/docs/simulation/creating-simulations/anatomy-of-an-agent/state) and external [**context**](/docs/simulation/creating-simulations/anatomy-of-an-agent/context), an agent will always end up with the same outbox and finishing state \(unless there is randomness in its behaviors\).

## Benefits of the Actor Model

1.  **Predictability**: how each agent behaves can easily be reasoned about from the messages it starts each time step with. You do not have to worry about race conditions, side effects, or locking access to resources while others attempt to access them. The agent can process its complete inbox for a time step in private, deciding what to do based on all the messages it has received.

1.  **Scalability**: the actor model allows us to have millions of agents running on dozens of servers, enabling much bigger simulations than other approaches which need to have agents communicate in the middle of a time step. HASH has been designed from the ground up to enable you to model entire countries without having to worry about the underlying infrastructure.

> “The big idea is 'messaging' … The key in making great and growable systems is much more to design how its modules communicate rather than what their internal properties and behaviors should be.”  
> **Alan Kay**

## Design questions and considerations

### Message timing

Because agents receive all the messages sent to them in the previous time step at the start of the next time step, you must take into account the "travel time" of messages:

- Agent A adds a message to Agent B in Step 1
- Agent B receives it and processes it in Step 2, adding a message to Agent A in response
- Agent A receives the response and processes it in Step 3

![](https://cdn-us1.hash.ai/site/docs/message-exchange-diagram.svg)

Agent A will not know the result of the message it added in Step 1 until it receives the response in Step 3 \(or even later if Agent B must communicate with a third agent before responding\). Watch out for [**redundant messaging!**](#redundant-messaging) You should also consider the [**order of behaviors**](#sequential-behavior-execution) when processing inbox messages and queueing outbox messages.

### Redundant Messaging

**Watch out for redundant messaging.** You can run into trouble with a naive message sending pattern where an agent sends messages until it receives a response.

```javascript
// Potentially Bad

function behavior(state, behavior) {
  if (!receivedResponse) {
    sendStateChangeMessage();
  }
}
```

This would send a message at timestep 1 \(_t_\) and timestep 2 \(_t+1_\), and if the message was prompting Agent B to make a change to its state, you might inadvertently apply an update twice.

You can avoid this in several ways, including by modifying Agent A's send behavior to only send every n timesteps, or modifying Agent B such that the effect is the same whether it receives one or many messages \(e.g. an idempotent messaging pattern\).

### Parallel Execution

In each timestep all agents execute simultaneously. They receive the messages addressed to them, run their behaviors, and update their state. This enables fast, deterministic simulations - but you’ll want to keep this parallel execution model in mind when designing your simulations. Since each agent is executing at the same time, every timestep, you need to include logic within the agent that handles situations where the agent shouldn’t do anything, for example because it should wait on the response of another agent.

There are multiple ways to ensure agents only execute when they should - you could add a check at the beginning of a behavior to see if it hasn’t received a particular message, or use a state flag that is set at the end of the last timestep \(e.g. state.waiting = true\).

### Competition for resources

What if agents are in competition for a resource? Agent A and B might both add a message to Agent C in the time step 1 requesting the same item. Now Agent C must decide what to do in time step 2 when it processes those messages, and inform A and B of the result.

A process for handling conflicts must be defined in any modeling approach - in the actor model, the fact that messages must be considered and responded to on successive time steps mean that a complex dispute might take several steps of back-and-forth messages to resolve.

To streamline this, consider:

- including any information in messages which might help resolve the dispute - e.g. include a second preference order if the first cannot be fulfilled \(where the agent receiving the order can handle both\).
- for more complex scenarios, using a mediating or manager agent which receives information from multiple agents, and can determine the best match in a single step.

<Hint style="info">
We are introducing a new feature to eliminate the need for manager agents and multiple back-and-forth messages to resolve conflicts. [**Contact us**](/contact) if you want to be one of the first to try this feature.
</Hint>

See [**Managing Resource Access**](/docs/simulation/concepts/design-considerations/managing-resource-access) for more.

### Managing timescales

By default, a 'step' in a simulation is simply the process of agents taking as input the messages received, state and context outputted from the previous step, and adjusting their internal state and producing messages as output for the next step. A step has no intrinsic relation to a particular unit of time.

For many simulations, you will want to have a sense of the passage of clock or calendar time. This might mean an assumption that a step corresponds to a unit of time. This can introduce difficulties when an action that should take a long time only requires one step to process, or when an action that should be near-instantaneous takes several message-passing steps to resolve.

There are strategies for aligning timescales discussed in detail in [**Designing for Different Timescales**](/docs/simulation/concepts/designing-for-different-timescales).

### Sequential Behavior Execution

**Another potential pitfall to be aware of is that behaviors run sequentially.** So if in Behavior A you send a message and in Behavior B you check if you received a message and set receivedResponse = True, if the agents behavior array is:

```json
["behaviorA", "behaviorB"]
```

a message would be sent before the agent checks if they've received a response.
