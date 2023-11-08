---
title: Composable Behaviors
slug: simulation/creating-simulations/behaviors/composable-behaviors
objectId: eaa33255-8efa-4fa0-a37e-90781a2bc889
---

# Composable Behaviors

**All user-authored behaviors, regardless of language, are** _**composable**_**.** This means they can be combined in any fashion with any number of others behaviors.

Python and JavaScript behaviors can co-mingle and a single agent can use behaviors programmed in multiple languages by a wide range of people.

**All user-authored behaviors can be shared on** [**hIndex**](/index)**.** Behaviors published in this way can be mapped to schemas for easy discovery during the agent creation process, and used in a simulation by anybody with a HASH account.

## Sharing a Behavior

You can share by right-clicking on a behavior you've created in the **Simulation Files** sidebar and selecting Release Behavior to Index. This will create a fork \(copy\) of the current project, and convert that fork into a Behavior project.

![Publishing a behavior to hIndex](https://cdn-us1.hash.ai/site/docs/screen-shot-2020-05-30-at-5.54.56-pm.png)

When you want to edit this behavior, create new releases, or add more behaviors to each release, you can do so in the forked project. You can find it by searching on your [Profile page](/profile), or by clicking in the banner when you're looking at the shared behavior's file in any simulation.

![Navigating to a shared behavior project](https://cdn-us1.hash.ai/site/docs/image%20%2821%29.png)

## Importing a Behavior

You can import a behavior by searching in the **Add to Project** sidebar, clicking on it and pressing the **Add to Project** button.

![Adding a published behavior to your model](https://cdn-us1.hash.ai/site/docs/image%20%284%29.png)

## Updating Imported Behaviors

Files you import into projects \(whether they be datasets, behaviors, or other snippets of code\) will not be automatically updated without action on your part. This ensures that breaking changes are not introduced to your simulation. You can update a behavior at any time by clicking the "update" file banner shown on any behavior or dataset which is outdated.

Whether you're exploring [auction dynamics](/@hash/english-auction), [supply](/@hash/supply-chain-fulfill) [chain](/@hash/supply-chain-calculate-order) [risk](/@hash/supply-chain-intake), or simply hoping to make your agent [self-destruct](/@hash/remove-self), there are a broad range of pre-built behaviors readily accessible on hIndex, and we'd love you to contribute your own.

When publishing components such as behaviors and datasets we encourage you to match these to the types of [Things](/schemas/Thing) to which they might relate. This type of "schema-mapping" enables you in the future \(or other modelers unfamiliar with your work\) to quickly identify components as relevant to particular types of actions or agents, dramatically speeding up the process of future model creation.

<Hint style="info">
**Things** are types in a schema that -- in the context of behaviors -- may represent actions which agents take, or types of agents themselves \(e.g. individuals, households, or companies\).
</Hint>
