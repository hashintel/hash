---
title: Main Loop
slug: simulation/extra/migrating/anylogic/main-loop
objectId: 1b7b0aef-f6b7-4e7a-9c28-6c8a2de3e63d
---

# Main Loop

Now that we have our list of agents, we move to step 2 - understanding the main loop. The main loop is a broad term meant to convey the general process of the simulation. While sophisticated simulations can and do evolve over time, there is always a process or set of processes that directs the agent interactions.

In this simulation it’s the process of delivering oil from tankers, through the supply chain, to retailers.

1.  Tankers deliver crude oil to storage tanks
1.  Which store it until needed by refineries
1.  Refineries refine the crude oil and send it back to storage agents
1.  Retailers provide oil to customers and when they run out request more
1.  Which triggers fuel tankers to go to the storage agents load oil
1.  And deliver it to retailers

![](https://cdn-us1.hash.ai/site/docs/anylogic-oil-main-loop.png)

It looks like we don’t have to initialize a special agent to handle any high-level functions here. The Main agent in AnyLogic is only responsible for initialization, which our creator agent will take care of.
