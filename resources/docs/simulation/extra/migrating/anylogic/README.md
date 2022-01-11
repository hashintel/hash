---
title: Migrating from AnyLogic
slug: simulation/extra/migrating/anylogic
objectId: 8844aee0-4d75-4e81-a9df-924c6fecc695
---

# Migrating from AnyLogic

AnyLogic is a 20+ year old desktop application that lets programmers write object-oriented Java to create simulations. AnyLogic also has limited support for visual programming, allowing non-programmers to create basic simulations.

In contrast to HASH, AnyLogic simulations cannot be distributed across multiple machines, although individual simulation runs may still be parallelized.

In this article we’ll discuss:

- At a high level, what principles should you follow when converting an AnyLogic simulation into a HASH simulation?
- What are the key paradigmatic differences between AnyLogic and HASH?
- Step-by-step how to convert an example simulation.

The example simulation we selected is the [Oil Supply Chain simulation](https://drive.google.com/file/d/192MY6ftxnaaeF-5YaM0Ok8BZItIzBrUb/view?usp=sharing), a neat model that demonstrates a transportation and supply chain network for delivering oil. [The finished HASH simulation is here](/@hash/oil-supply-chain).
