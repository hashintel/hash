---
title: Using the Process Model Visual Interface
slug: simulation/tutorials/building-process-models/using-the-process-model-builder
objectId: 94b05ca6-53c7-47dd-a22d-8c8f1a76d78f
---

# Using the Process Model Visual Interface

The process model visual interface lets you diagram your desired process model and, in one click, create a functioning HASH simulation. In this how-to guide we'll walk through the visual interface and how to build a process model with it.

It's worth emphasizing that you don't **need** to use the visual interface — HASH is a full fledged IDE for building simulations — you can use our process modeling library independent of the visual interface, or you code your own process model from scratch. Using the visual interface is one approach to building a process model that is easy and, dare I say it, fun?

![Process Chart View](https://cdn-us1.hash.ai/site/docs/image%20%2849%29.png)

<Hint style="info">
If you can't see the process chart view, click `View > Process Chart`
</Hint>

The process chart is available as a view on the right-hand half of the screen. You can drag elements from the dock on the left-hand side of the view and connect them together.

![](https://cdn-us1.hash.ai/site/docs/kapture-2021-03-29-at-19.57.12.gif)

Each element in the dock represents a [process block](/docs/simulation/concepts/designing-with-process-models/process-blocks). By connecting them together you can feed objects that are generated at the start of the process — from the **source block** — through a process that terminates at a **sink block**.

Clicking on a block will bring up the parameters for the block. You can customize the parameters for your simulation by setting them on the blocks.

![](https://cdn-us1.hash.ai/site/docs/kapture-2021-03-29-at-20.01.01.gif)

By clicking the 'Add to Model' button, the visual interface will automatically create an agent that represents the process model. Specifically, three things will happen:

- A behavior, called `create_process.js` will be created. This behavior contains the logic of the process model. Any necessary dependencies from the process library will be imported.
- `init.json` will be modified to include an agent that will first call `create_process.js`, telling the engine to create the process model agent, and then `remove_self.js`, removing itself from the simulation so that the process agent is only created once.
- `analysis.json` will be modified to include useful plots for the process model.

Now you can run your simulation. The process model will execute based on the logic you defined in the process chart. You can see the execution by clicking [Raw Output](/docs/simulation/creating-simulations/views/raw-data#raw-output) to watch objects move through the model, or [Analysis](/docs/simulation/creating-simulations/views/analysis/README) and viewing the plots of the behaviors.

If you want to make a change to the model, you can modify the diagram and click 'Add to Model'. This will replace the previous behavior with a new behavior containing new process model logic.

<Hint style="warning">
Currently the process model chart view only persists while on the IDE. If you refresh or navigate to a different page and then return, the process chart will return to its starting of a single starting node. If you added the process agent to the model, the process agent **will** exist, it just won't be visualized on the process chart. Future updates to the visual interface will include persistence.
</Hint>
