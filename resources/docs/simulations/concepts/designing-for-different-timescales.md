---
description: Building complex multi-timescale simulations
---

# Managing Timescales

When designing a simulation, you'll often start at a high level of abstraction and then, through the creation process, zoom in and add more fine grained details to the world. For instance if you're building a simulation of a city, you might start by designing people agents to travel to an office building on the eighth time-step, and then return home eight time-steps later, under the assumption that each time-step is something like an hour.

So far so good, but let's say after this first version you want to add a feature for the agent to decide whether it's going to shower before it goes to the office. No matter what, the smallest execution step in HASH is going to be one time-step. This poses a problem because my mental representation of the simulation is that each time-step is an hour, and few people default to hour long showers.

Expressing multiple timescales in a simulation is a difficult problem that exists across platforms and frameworks. Often you're forced to break your representation of time and just ignore the different timescales.

There are a couple of different ways you can solve this problem in HASH. Two common approaches are:

* Add delays to normalize the actions across timescales.
* Use a "ManagerAgent" to signal when agents should pause to allow for different computation times

{% hint style="info" %}
We are also going to introduce in-built ways of handling a global timescale - enabling the duration or trigger points of behaviors to be specified in line with calendar-time schedules.
{% endhint %}

## Solutions

### **Delays**

A simple and straightforward approach is to "slow down" the simulation. In our example above, a time-step would now be 15 mins, and the agent would leave for work either on the first or second time-step, depending on whether they take a shower. They then leave work to return home on the 32nd time-step.

This has the advantage of being a straightforward, simple way of increasing the resolution of a simulation. The downside is it's inefficient - it's only in the first two steps of the simulation that we need the increased granularity. The additional 24 time-steps aren't really needed.

### **Managers**

An alternative approach is to create a ManagerAgent that is responsible for managing the time scales. A ManagerAgent in this role - lets call it TimeManager - has a basic design:

* It can message any agent in the simulation that might be affected by time differences. You can accomplish that by adding an array of agent names or ids to a TimeManager field, or by increasing the TimeManager's search radius and getting agents from `context.neighbors()`.
* It will be signaled, either by a message sent from an agent or by global properties \(such as a specific time-step\) when certain agents need to pause their actions. 
* It then sends a message to those agents. The message could include a time-step when they can resume computation.
* The agents that are signaled by the time manager will need a behavior that can handle this message; most likely it will change the agents behavior array`state.behaviors = ['time_handler.js']`
* The time manager, if it receives a message that the faster agent has finished, will send a restart message to the other messages.

In essence the time manager is specifying which agents run on any given time-step based on business logic. [We've published an example simulation using a time manager](https://hash.ai/@hash/time-management).

{% hint style="warning" %}
Timescale management is a particularly common issue for new HASH users because [we utilize an actor model where there is "information lag" ](design-considerations/#actor-model)- a roundtrip message will take, at minimum, three time-steps.
{% endhint %}

