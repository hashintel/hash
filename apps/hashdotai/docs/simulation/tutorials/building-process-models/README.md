---
title: Building Process Models
slug: simulation/tutorials/building-process-models
objectId: e46938a4-1a49-414c-9e27-fb4d41614526
---

# Building Process Models

Business processes are the cornerstone of every company's operations. Defined and repeatable plans for satisfying business objectives differentiate a focused, efficient machine from a disorganized mess.

However, given the complexity and scale of modern businesses, it can be hard to create and optimize business processes. When dealing with tens of thousands of people managing hundred-step processes, we rapidly approach the limits of what any one person can design or understand.

At HASH we're excited about the potential of computer-aided decision making - using the computer as a partner in deliberation and understanding, helping us find ideas and solutions that we couldn't otherwise. Our approach is to use simulations of the real world to find the best outcomes, and maybe even more importantly, help people understand why a given choice, out of all the alternatives, is the right one to make.

We feel that business processes are a particularly promising domain to apply modeling and simulation:

- There are few existing tools for quickly simulating and analyzing business processes.
- Optimizations to business processes can quickly turn into millions of dollars of cost savings/new revenue
- Many of our users already manage projects, teams, and workflows that can be expressed as business processes.

We've released a new visual interface, built using the [HASH business process library](/@hash/process), to make it easy to use HASH to simulate business processes and operations \(for more on building plugins with HASH see [the API pages](/docs/simulation/api/register-for-access)\).

![](https://cdn-us1.hash.ai/site/docs/image%20%2850%29.png)

## Process Modeling

Features:

- Dead simple drag and drop interface for defining business process models.
- When you've made your model you can, in one click, send it to a HASH simulation which will automatically interpret the model and use the correct simulation behaviors.
- Run the simulation and explore the results to find the best process model and the best parameters.

And because it's all still powered with HASH, you can customize and extend any part of it. Combine it with other models, add data, modify a behavior - it's all there for you to fit to your own use cases.

You can start building right away, and to learn more continue reading our how-to guides.

- [Process Model Concepts.](/docs/simulation/concepts/designing-with-process-models/process-model-concepts)
- [Using the Process Model Visual Interface](/docs/simulation/concepts/designing-with-process-models/using-the-process-model-builder)
- [Adding data to a Process Model](/docs/simulation/concepts/designing-with-process-models/using-data-in-a-process-model)
- [Analyzing process models](/docs/simulation/concepts/designing-with-process-models/analyzing-process-models)
- [Experimenting with Process Models](/docs/simulation/concepts/designing-with-process-models/experimenting-with-process-models)

Along with our video tutorial on building your first process model.

We'd love to know what you build. Contact us via [the website](/contact), post on the [HASH support forum](https://hash.community/) or share on our public [HASH community Discord](/discord) server.

<Hint style="info">
Given that HASH is a general platform for simulations, specific simulation 'tools' can be built on top of it. Just like with modern computers, HASH can be the OS for quickly creating domain specific applications. [Using the HASH API you can create your own interfaces.](/docs/simulation/creating-simulations/views/api-1)
</Hint>
