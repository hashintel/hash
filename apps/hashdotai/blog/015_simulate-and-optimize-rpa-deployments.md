---
title: "Simulate and Optimize RPA Deployments"
date: "2021-05-04"
cover: https://imagedelivery.net/EipKtqu98OotgfhvKf6Eew/2a372bf8-4d00-473e-1a1f-16d537234200/public
categories: 
  - "Simulation"
---

Robotic process automation (RPA) is an emerging field that promises to change the way organizations are run. RPA is a methodology and technique for automating basic business tasks with 'bots' that records users' actions and infer the steps necessary to reproduce it. Repetitive tasks, like scraping websites or downloading photos, can be easily automated without specialized programming knowledge. It's an exciting step to provide other job functions the type of powerful tooling that software engineers have long had.

This poses interesting opportunities for simulation. As more and more business actions are represented in an RPA format for automation, those same workflows can be simulated by [generating process models](https://docs.hash.ai/core/concepts/designing-with-process-models) from their RPA representations. Over time, in an organic manner, you can generate a digital twin of your business, which in a virtuous cycle can help you improve your RPA processes. In essence anything that can be orchestrated using software can be simulated using software!

Here's a simple example of an RPA simulation in HASH. We can take an RPA diagram, like this one of an Insurance process from Automate Anywhere, and recreate it as a process model in HASH.

![](https://embedwistia-a.akamaihd.net/deliveries/1becf5633e62d5070dd51a11b8336f14.webp?image_crop_resized=1280x720)

Image from [Automate Anywhere](https://www.automationanywhere.com/solutions/insurance)

Depending on the format your RPA data is stored in, you can replicate them through an [intuitive visual diagramming tool](https://hash.ai/glossary/business-process-modeling) or load it as a dataset.

In this case we can recreate the process as a HASH simulation using the process chart visual editor.

<iframe style="position: absolute; top: 0; left: 0;" src="https://core.hash.ai/embed.html?project=%40b%2Frpa-insurance-firm&amp;ref=stable&amp;view=process" width="100%" height="100%" frameborder="0" scrolling="auto"></iframe>

It's not too different from a general process simulation - the only difference is in expectations of speed and who (or what) will be performing what task, man or machine.

We set the different bot and human tasks as service or delay blocks that process the insurance claims at different speeds. As more of the human tasks - like manual review - become automatable, we can adjust the time parameters of the blocks and replace human tasks with bots, and evaluate the downstream effects on business performance. For example, in the following chart, sample parameters demonstrate how much more efficient our hypothetical business could be by investing in more automation of the special review or standard review process.

![](images/image7.png)

By building a digital twin of your RPA processes, you can create a predictive engine to understand ahead of time how automation might benefit your business, saving time and money through _in silico_ testing and experimentation.
