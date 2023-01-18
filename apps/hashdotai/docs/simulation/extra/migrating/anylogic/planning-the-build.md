---
title: Planning the Build
slug: simulation/extra/migrating/anylogic/planning-the-build
objectId: c5053645-5e04-49a3-99ad-239296c6ce7b
---

# Planning the Build

Let’s apply this mental model to the [Oil Supply Chain](/@hash/oil-supply-chain) model.

We start by cataloguing the agents. In AnyLogic you can double click on any of the agents to see the relevant functions, properties, state charts, etc.

## Agents

**FuelTruck**

<TextTabs>
<TextTab title="Purpose" >

Fuel Trucks transport oil from refineries and storage agents to retailer agents.
</TextTab>

<TextTab title="Properties" >

- retailer: The location of a RetailerAgent to deliver to
- capacity: The amount of oil a fuel truck can store
- loadingRate: How long it takes to load oil from a storage unit into the truck

</TextTab>

<TextTab title="Behaviors" >

- A fuel truck should respond to demand from retailers by picking up oil.
- A fuel truck should load oil at a loadingRate from a refinery/storage location
- A fuel truck should deposit it at a given retailer

</TextTab>
</TextTabs>

**Refinery**

<TextTabs>
<TextTab title="Purpose" >

Refinery Agents take unprocessed oil and refine it into oil that can be delivered to storage units / retailers
</TextTab>

<TextTab title="Properties" >

- capacity: amount of oil a refinery agent can store
- refiningRate: speed that unrefined oil is refined

</TextTab>

<TextTab title="Behaviors" >

- A refinery agent should accept and store crude oil
- A refinery agent should 'process' the crude oil, turning it into refined oil
- A refinery agent should load oil into fuel trucks or storage units

</TextTab>
</TextTabs>

**Retailer**

<TextTabs>
<TextTab title="Purpose" >

Retailers represent customer demand for oil and request and receive oil from fuel agents.
</TextTab>

<TextTab title="Properties" >

- capacity: amount of oil a retailer can store
- reorderLevel: the level of current capacity vs. max at which retailer orders fuel
- meanOrder: mean order size of fuel

</TextTab>

<TextTab title="Behaviors" >

- Retailers should place orders w/ fuel trucks to be resupplied
- Retailers should accept oil from fuel trucks
- Retailers should decrease their current stock over time.

</TextTab>
</TextTabs>

**Storage**

<TextTabs>
<TextTab title="Purpose" >

Storage agents hold unrefined and refined oil.

</TextTab>

<TextTab title="Properties" >

- capacity: amount of oil a storage agent can store
- terminal: boolean value for whether a storage agent is a terminal destination \(at which point the oil leaves the simulation\)
- type: type of storage agent \(ports, storage, distributors\)

</TextTab>

<TextTab title="Behaviors" >

- A storage agent should respond to refinery agents, tankers, fuel truck agents and send oil or accept oil
- A storage agent should send x amount of oil to an agent, where x is the loadingRate/unloadingRate of the agent

</TextTab>
</TextTabs>

In the AnyLogic model there are three different types of storage locations: ports, storages, and distributors

- Ports have to be able to unload oil from Tanker agents
- Storages need to be able to accept the flow of oil in and out
- Distributors need to be able to send trucks to refuel retailers

All of these share lots of features, so we’ll be able to make use of HASH’s composable behaviors to define our agents.

**Tanker**

<TextTabs>
<TextTab title="Purpose" >

Tankers deliver oil from ‘outside the sim’ \(they actually generate it\) to storage units
</TextTab>

<TextTab title="Properties" >

- capacity: amount of oil a tanker agent can store
- unloadRate: the speed tankers can deliver oil

</TextTab>

<TextTab title="Behaviors" >

- Tankers should move to storage agents to deliver oil
- Tankers should unload oil into storage agents
- Tankers should fill their oil to capacity if at a specific position

</TextTab>
</TextTabs>

If you’ve been following along you’ll notice we left off one agent - Pipelines. Pipelines act as a flow regulator, decreasing quantity in one agent and delivering it to another. In our simulation we're going to use [messages](/docs/simulation/creating-simulations/agent-messages/) to accomplish a similar thing. Messaging is a key primitive operation provided by HASH, and as you’ll see we use it throughout the simulation.

Since we can represent the behavior of Pipelines completely through messages, we'll effectively combine it with the Storage agents to reduce the number of agents in the simulation, and the complexity of interactions. But more on that later.
