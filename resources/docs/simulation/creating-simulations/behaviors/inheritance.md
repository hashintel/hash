---
title: Inheriting Behaviors
slug: simulation/creating-simulations/behaviors/inheritance
objectId: 5e2af55a-b595-4fb4-8cd4-7a10916695f6
description: Agent Types in HASH
---

# Inheriting Behaviors

<Hint style="warning">
**This page describes an upcoming feature in HASH that has not yet been released.**
</Hint>

One great feature offered by object-oriented programming languages is the ability to define a _class_ of agents, and derive classes from classes \(a process known as inheritance\). This makes scaling out agents easy, but can also be constraining in terms of the ability to compose agents who may not fit neatly into pre-defined hierarchies.

## The Object-Oriented Dilemma

<Hint style="info">
Consider Arnold Schwarzenegger, the indomitable bodybuilder-actor-poltician. _Is he a bodybuilder, an actor, or a politician?_
</Hint>

The real world doesn't fit into neat hierarchies. Modeling agents who are of multiple classes, such as Arnie, isn't easy. Should you create `actor` a subclass of `politician` for the Governator and similarly-shaped peers such as actor-turned US President Ronald Reagan? Or would you be better off defining a sub-class of actors who are politicians? Why not start with bodybuilder as the top-level class? There's no easy answer, and when you're scaling a simulation to millions of agents things quickly become a mess.

## Introducing Agent Types

In HASH, agents are _in practice_ defined by their behaviors. While users are free to add a `type` field to their agents, and many simulation authors do so, these _types_ have until now been symbolic labels that have made tracking agents over the course of simulations easier, and have primarily been used to generate descriptive metrics and plots.

We're now planning to introduce support for **Agent Types** in HASH which go further. In an upcoming update, hEngine will attempt to match the _type_ field of an agent, to a schema in hIndex.

Schemas published to hIndex may describe either:

1.  agents \(Agent Types\); or
1.  actions taken by agents \(Behaviors\).

Schemas consist of _properties_ with _expected types_, and in some cases these may have _default values_. Going forward, all agent schemas in HASH will contain a `behavior` property. This can be set to contain one or more behaviors.

When an agent in a HASH simulation has its _type_ declared going forward, if hEngine is able to match that type to an hIndex-published schema, any behaviors specified in that schema's `behavior` array will be attached to the agent.

There is no limit to the number of types that may be attached to an agent, and types may continue to be used descriptively without being linked to hIndex-listed schemas.

<Hint style="info">
As part of these changes, we'll be allowing users to publish their own schema definitions to hIndex, and attach arrays of hIndex-published behaviors to these schemas.
</Hint>
