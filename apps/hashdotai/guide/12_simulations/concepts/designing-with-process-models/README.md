---
title: Process Modeling
slug: simulation/concepts/designing-with-process-models
objectId: 35b4192a-b378-480f-a904-be39061eefdd
---

# Process Modeling

Process models allow you to represent systems or organizations which perform sequences of tasks. By chaining together delays, resource allocations, and other blocks representing real-life tasks and events, you can simulate processes such as assembly lines, company workflows, and supply chains.

The process chart view in the hCore editor leverages the [HASH process library](/@hash/process) to make it easy to simulate business processes and operations.

![](https://cdn-us1.hash.ai/site/docs/image%20%2850%29.png)

With the process chart, you can:

- Use a dead simple drag and drop interface for defining your process.
- In one click, add it to your HASH simulation. It will automatically interpret the model and add the correct behaviors and parameters.
- Run the simulation and explore the results to find the best process model and the optimal parameters.

Additionally, you can use the [Process Modeling Library](/@hash/process) behaviors directly to build a process model. Because it's all still powered with HASH, you can customize and extend any part of it. Combine it with other models, add data, modify a behavior - it's all there for you to fit to your own use cases.

Building process models allows you to answer questions about your real world systems. They can help you improve resource allocation, reduce cycle-time, and identify other optimizations that can be made to your organization or system. They're especially effective when used with [Experiments](/docs/simulation/creating-simulations/experiments/) to explore multiple scenarios and configurations.

<Hint style="info">
The [Building Process Models](/docs/simulation/tutorials/building-process-models) tutorial walks through using the visual interface to build a simple ticket queue simulation.
</Hint>

<Hint style="success">
For a framework for applying process models, check out [Simulating Constraints: A Framework for Process Optimization](/blog/process-optimization-simulation-framework).
</Hint>

Example simulation built with the process model library:

- [Billing Department simulation](https://core.hash.ai/@hash/billing-department-process/stable)
- [Call Center simulation](https://core.hash.ai/@hash/interconnected-call-center-single-agent/stable)
