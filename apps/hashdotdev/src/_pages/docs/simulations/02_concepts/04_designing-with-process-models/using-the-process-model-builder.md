---
title: Using the Process Model Visual Interface
slug: simulation/concepts/designing-with-process-models/using-the-process-model-builder
objectId: 09140f39-a6fe-44e3-be22-d86d9c39be0b
---

# Using the Process Model Visual Interface

The process model visual interface lets you diagram your desired process model and, in one click, create a functioning HASH simulation. In this how-to guide we'll walk through the visual interface and how to build a process model with it.

It's worth emphasizing that you don't **need** to use the visual interface - HASH is a full fledged IDE for building simulations - you can use our process modeling library independent of the visual interface, or you code your own process model from scratch. Using the visual interface is one approach to building a process model that is easy and, dare we say it, fun?

![Process Chart View](https://cdn-us1.hash.ai/site/docs/image%20%2852%29.png)

<Hint style="info">
If you can't see the process chart view, click `View > Process Chart`
</Hint>

The process chart is available as a view on the left-hand half of the screen. You can drag elements from the dock on the left hand side of the view and connect them together.

![](https://cdn-us1.hash.ai/site/docs/kapture-2021-03-29-at-19.57.12.gif)

Each element in the dock represents a [process block](/docs/simulation/concepts/designing-with-process-models/process-blocks). By connecting them together you can feed objects that are generated at the start of the process - from the **source block** - through a process that terminates at a **sink block**.

Clicking on a block will bring up the parameters for the block. You can customize the parameters for your simulation by setting them on the blocks.

![](https://cdn-us1.hash.ai/site/docs/kapture-2021-03-29-at-20.01.01.gif)

You can click the gear icon next to the Add to Model button to set resource parameters for the process model as a whole. Several blocks, like Seize, Release, and Service, use and release 'resources'. For instance, you can imagine if you have a process model of a pizza baking process, there might be a limited number of ovens. That's a resource that could be defined on the model.

![Pizza Process with four ovens available](https://cdn-us1.hash.ai/site/docs/image%20%2854%29.png)

By clicking the Add to Model, the visual interface will automatically create an agent that represents the process model. Specifically, three things will happen:

- A behavior, called `create_process_from_chart.js` will be created. This behavior contains the logic of the process model. Any necessary dependencies from the process library will be imported.
- `Init.json` will be modified to include an agent that will first call `create_process_from_chart.js`, telling the engine to create the process model agent, and then `remove_self.js`, removing itself from the simulation so that the process agent is only created once.
- `Analysis.json` will be modified to include useful plots for the process model.

Now you can run your simulation. The process model will execute based on the logic you defined in the process chart. You can see the execution by clicking [Raw Output](/docs/simulation/creating-simulations/views/raw-data#raw-output) to watch objects move through the model, or analysis and viewing the plots of the behaviors.

If you want to make a change to the model, you can select the process model you want to update, modify the diagram, and click update.

![Updating a process model](https://cdn-us1.hash.ai/site/docs/updating_processes.gif)

If you have multiple process models in your simulation, you can set the name of the model by clicking the gear icon.
