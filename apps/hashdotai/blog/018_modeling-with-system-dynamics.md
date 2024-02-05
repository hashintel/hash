---
title: "Modeling with System Dynamics"
date: "2021-05-18"
categories: 
  - "Simulation"
---

[System Dynamics](https://hash.ai/wiki/system-dynamics) models are a powerful tool for visualizing and modeling complex systems. They break down a model into abstract or concrete quantities (**stocks**), and the rates at which they change (**flows**). HASH’s [System Dynamics library](https://hash.ai/@hash/sd) makes it easy to incorporate these types of models into your simulations.

With the HASH library, models are always defined and run on a single agent. Thanks to HASH’s modular nature, you can use System Dynamics to build an entire model, or use it as a single component within a larger agent-based model.

For example, we can import the library and use it to build a model of a widget factory, diagrammed below. You can follow along in this [simulation](https://hash.ai/@hash/widget-factory-system-dynamics).

![](https://lh3.googleusercontent.com/_gIIL8_LzpZK_1nhK44H4QoX9NFLy3Eh6UPfi9yDdJWOyQ6-VA8F3pIAthToAnf5LrJz2fywJCaIp1PCTyTQLD7WPlW1iHIkrTf7r4P6QEDOp27zHmAqTzQqhgJh7iYLVb63B46k)

# Designing our Factory

Let’s take a look at the **stocks** and **flows** in our model:

1. Widgets: the amount of widgets in the factory. Widgets can be _produced_ or _sold_.

3. Employees: the number of current employees producing widgets. Employees can be _hired_ or _fired_, to attempt to match the demand for widgets.

5. Expected Demand: the demand that the factory expects at each step of the simulation. This value attempts to increase or decrease to converge to the true demand by _expecting more_ or _expecting less_.

You’ll notice that the stocks in our model represent both concrete quantities (widgets and employees) and abstract quantities (expected demand).

### Defining Rates

We’ll follow the format given in the System Dynamics Library to specify the stocks, flows, and constants in our model. We'll specify these in the `sd_definition` object, with one entry for each flow. Each one will also have a current `"rate"` value (defaulting to 0), a `"to"` and/or `"from"` field, and a `"rate_expression"`. Let’s take a closer look at the equations we'll use to define the flow rates:

- Produce = employees \* productivity

- Sell = demand

- Hire = widgets < lower\_limit \* expected\_demand ? hiring\_rate : 0

- Fire = widgets > upper\_limit\* expected\_demand ? firing\_rate : 0

- Expect More = demand > expected\_demand ? 0.1 \* (demand - expected\_demand) : 0

- Expect Less = demand < expected\_demand ? 0.1 \* (expected\_demand - demand) : 0

All the constants in use in these equations are located on the top level of the agent definition. Take a look at the [simulation code](https://core.hash.ai/@hash/widget-factory-system-dynamics/1.0.0), and the [System Dynamics Library](https://hash.ai/@hash/sd) README for more information and examples.

### Visualizing the System

Creating plots for System Dynamics models is just as straightforward as any other model in HASH. We'll define a metric for each of our stocks, and a time-series plot for each of those. The first two graphs oscillates, as the factory over and undershoots its ideal amount of employees.

![](images/image9.png)

![](images/image10.png)

The third graph shows how expected demand approaches the actual demand for widgets. The factory is always able to meet the demand, so the curve for demand and widgets\_sold is identical.

![](images/image11.png)

### Finishing the Model

To make our simulation more interesting, the last thing we’ll do is add a behavior to change the demand on a monthly basis. We’ll use a behavior called "change\_demand.js" to do that, and add it into the behavior array.

\[
  "@hash/age/age.rs",
  "change\_demand.js",
  "@hash/sd/calc\_rates.js",
  "@hash/sd/step.js"
\]

Now we’ll be able to test our model, and see how well it responds to changes in demand.

![](images/image12.png)

You’ll notice that we still have strong oscillations as the factory over and under-stocks itself, then subsequently hires or fires employees. Occasionally it'll oscillate too low, and it won't be able to meet demand for a number of time steps. These oscillations are a common symptom of delays (or lack thereof) in real-world systems. In our case, the "delay" is that the factory cannot instantaneously hire or fire the exact amount of employees it needs.

# Experimenting with Our Model

Since the delays in our model are controlled by the hiring\_rate and firing\_rate, it makes sense to experiment with varying those two global parameters. There are two experiments in the model that will perform sweeps of both of those values. Observe the differences in the amplitude of the oscillations, and how often the factory ever fails to deliver. You'll notice that both extremes of parameter values don't perform as well as the moderate values, either by oscillating too much, or by hitting 0 widgets.

![](images/image13.png)

* * *

In a future post, we'll show you how we can use HASH's optimization wizard to not just explore our model, but come to concrete conclusions about the ideal configuration of the system, producing quantitative answers.
