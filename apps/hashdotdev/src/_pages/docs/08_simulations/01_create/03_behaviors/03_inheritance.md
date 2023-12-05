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

## Agent Types

In HASH, agents are _in practice_ defined by their behaviors. While users are free to add a `type` field to their agents, and many simulation authors do so, these _types_ have until now been symbolic labels that have made tracking agents over the course of simulations easier, and have primarily been used to generate descriptive metrics and plots.

We're now planning to introduce support for **Agent Types** in a forthcoming update, which go further. In the future, [HASH Engine](/platform/engine) (hEngine) will attempt to match the _type_ field of an agent to an entity type in HASH, where it contains the URL of an _entity type_ schema.

Entity types created in HASH describe 'things'. In a simulation context these could for example be:

1.  agents \(Agent Types\); or
1.  actions taken by agents \(Behaviors\).

Entity types consist of _properties_, each of which has their _own_ property types, and in some cases these may have _default values_. Entity types in HASH may contain a `hash_simulation_behavior` property containing one or more [behaviors](/docs/simulation/creating-simulations/behaviors).

When an agent in a HASH simulation has its _type_ declared going forward, if hEngine is able to match that type to a valid entity type URL, any behaviors specified in that schema's `hash_simulation_behavior` array will be attached to the agent.

There is no limit to the number of types that may be attached to an agent, and types may continue to be used descriptively without being linked to entity type URIs.

<Hint style="info">
As part of these changes, you'll be able to attach any number of HASH simulation behavior files to an entity type under the protected `hash_simulation_behavior` property.
</Hint>
