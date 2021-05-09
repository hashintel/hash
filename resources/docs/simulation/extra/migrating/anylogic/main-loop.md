# Main Loop

Now that we have our list of agents, we move to step 2 - understanding the main loop. The main loop is a broad term meant to convey the general process of the simulation. While sophisticated simulations can and do evolve over time, there is always a process or set of processes that directs the agent interactions.

In this simulation it’s the process of delivering oil from tankers, through the supply chain, to retailers.

1. Tankers deliver crude oil to storage tanks
2. Which store it until needed by refineries
3. Refineries refine the crude oil and send it back to storage agents
4. Retailers provide oil to customers and when they run out request more
5. Which triggers fuel tankers to go to the storage agents load oil
6. And deliver it to retailers

![](https://lh6.googleusercontent.com/smDMCG9NqVz4Hg3VFdiQr95oNibC9mvxEYmxugc2ckHSkZ1vOd8qrUyodV3___N3UzSXpuVI9UpnYr6uOSmrN_DoOAvAOPfjl7-xYyIRUzEwHSg6GaBdQizKsLRWdj6i2F3NcSgy)

It looks like we don’t have to initialize a special agent to handle any high-level functions here. The Main agent in AnyLogic is only responsible for initialization, which our creator agent will take care of.  


