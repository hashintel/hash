---
title: "Discrete Event Library"
date: "2021-06-08"
categories: 
  - "Simulation"
---

Discrete event modeling is a popular paradigm for building simulations, introducing "events" that cause changes in the simulation state. In between events, no changes happen to the state. This saves computational effort and reduces the time to compute a simulation.

You can imagine a simulation of a manufacturing process where a new car rolls off the line every 1-2 hours, and you you only care about what happens once the car rolls off the line. It would be wasteful to simulate a 'real time' version of the simulation at the minute level, where nothing happens the majority of the time. We instead want to structure it so that the simulation updates, and the state changes, when the 'new car' event is triggered.

We've released a [new timing library](https://hash.ai/@hash/des) which features behaviors you can add to your agent based simulation to run it as a discrete event simulation. It provides the functionality to create a discrete event simulation on it's own, or in conjunction with the many other libraries in HASH.

The timing library is structured around triggers. Triggers are messages that are sent from a single agent, the scheduler, to an agent or agents notifying them about a simulation **event**. Based on the agents' behaviors, they will take some sort of action based on the trigger.

There are three types of triggers:

- A schedule-based trigger creates events from a user defined CSV, where every row corresponds to an event at a particular timestep.

- A message-based trigger creates an event when enough messages of a given type have been received. You can think of this as akin to a call-and-response pattern - when all agents complete their actions and send a 'done' message to the scheduler, it triggers the next event, causing the agents to begin their next set of actions.

- A neighbor-based trigger is similar to the message based trigger, but its activated through the scheduler agent's neighbors. If a given number of agents proximal to the agent have a field with a certain value, a new event is triggered.

You can see the triggers in action in this example simulation:

<iframe src="https://core.hash.ai/embed.html?project=%40hash%2Fdes&amp;ref=stable&amp;" width="100%" height="100%" frameborder="0" scrolling="auto" style="position: absolute; top: 0; left: 0;"></iframe>

To add the library to your simulation, search for it in the bottom left panel.

![](images/screely-1622071521813.png)

You can [learn more about the library here](https://hash.ai/@hash/des/overview), and [come chat with us in Discord](https://discord.gg/BPMrGAhjPh) about your excellent ideas for discrete event simulations.
