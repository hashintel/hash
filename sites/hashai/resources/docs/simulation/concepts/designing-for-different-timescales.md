---
title: Managing Timescales
slug: simulation/concepts/designing-for-different-timescales
objectId: 892fd7c4-b442-44da-8d22-cc5c0fdf58ac
description: Building complex multi-timescale simulations
---

# Managing Timescales

When designing a simulation, you'll often start at a high level of abstraction and then, during the creation process, zoom in and add more fine grained details to the world. For instance if you're building a simulation of a city, you might start by designing people agents to travel to an office building on the eighth time-step, and then return home eight time-steps later, under the assumption that each time-step is something like an hour. Should you decide to add more detail to a simulation - for example, agents eating breakfast at quarter past the hour - you could run into difficulty in moving all of the agents to the new, shorter timescale.

Expressing multiple timescales in a simulation is a difficult problem that exists across platforms and frameworks. Often you're forced to break your representation of time and just ignore the different timescales.

There are a couple of different ways you can solve this problem in HASH. Common approaches are:

- Add discrete event features to signal when agents should pause to allow for different computation times
- Add delays to normalize the actions across timescales.

<Hint style="info">
We are also going to introduce in-built ways of handling a global timescale - enabling the duration or trigger points of behaviors to be specified in line with calendar-time schedules.
</Hint>

## Discrete Event Simulations

Discrete Event Simulations \(DES\) are event driven simulations. Agents take actions when a specific event occurs; otherwise they do nothing. In most cases DES models don't compute the time between events. The only part of a model that is simulated is during an event.

The important features of a DES simulation are:

- A way to generate events
- Triggers that cause agents to act or stop acting.

When an event occurs, specific agents in a simulation need to take certain actions, and when they've completed those actions, pause until the next appropriate event.

The most common way to implement this in HASH is through a manager agent - it's how we've implemented the [shared discrete event library](/@hash/des) you can import into your simulation. Alternatively you can roll your own manager agent to handle different timescales.

### Managers

A ManagerAgent in this role - lets call it TimeManager - has a basic design:

- It can message any agent in the simulation that might be affected by time differences. You can accomplish that by adding an array of agent names or ids to a TimeManager field, or by increasing the TimeManager's search radius and getting agents from `context.neighbors()`.
- It will be signaled, either by a message sent from an agent or by global properties \(such as a specific time-step\) when certain agents need to pause their actions.
- It then sends a message to those agents. The message could include a time-step when they can resume computation.
- The agents that are signaled by the time manager will need a behavior that can handle this message; most likely it will change the agents behavior array`state.behaviors = ['time_handler.js']`
- The time manager, if it receives a message that the faster agent has finished, will send a restart message to the other messages.

In essence the time manager is specifying which agents run on any given time-step based on business logic. [Here's an example simulation using a generic time manager](/@hash/time-management).

## Delays

A simple and straightforward approach is to "slow down" the simulation. In our example above, a time-step would now be 15 mins, and the agent would leave for work either on the first or second time-step, depending on whether they take a shower. They then leave work to return home on the 32nd time-step.

This has the advantage of being a straightforward, simple way of increasing the resolution of a simulation. The downside is it's inefficient - it's only in the first two steps of the simulation that we need the increased granularity. The additional 24 time-steps aren't really needed.

<Hint style="warning">
Timescale management is a particularly common issue for new HASH users because [we utilize an actor model where there is "information lag" ](/docs/simulation/concepts/design-considerations#actor-model)- a roundtrip message will take, at minimum, three time-steps.
</Hint>
