---
title: Cloud Compute
slug: simulation/creating-simulations/h.cloud
objectId: 32b300a1-02a7-44ac-9db9-8300ef180496
description: Run simulations on our hCloud infrastructure
---

# Cloud Compute

<Hint style="success">
**10 hours of free hCloud compute time is provided to every user each month.**  
There are no limitations or caps on your ability to simulate things locally in-browser.
</Hint>

<Hint style="info">
**You must have created at least one** [**experiment**](/docs/simulation/creating-simulations/experiments) **in order to run a model on hCloud.**  
Single-run simulations are not supported on hCloud at this time. Please ensure you have at least one experiment defined in your `experiment.json` file before proceeding.
</Hint>

Simulations within **hCore** can be run in one of two ways: locally inside your browser, or at scale on our **hCloud** compute platform.

<!-- prettier-ignore -->
|  | **Browser** | **Cloud** |
| :--- | :--- | :--- |
| **Stage of Development** | Prototyping | Running Experiments or Large Simulations |
| **Number of Agents** | 1..10,000 | 10,000+ to ∞ |
| **Pricing** | Always Free | Free tier, pay-as-you-go, and subscription options |

Exact in-browser limits will depend on the amount of processing power and RAM available to the browser tab running hCore. The prime constraint is often the power of the local machine's underlying hardware.

<Hint style="warning">
Devices with ARM processors will typically run in-browser hCore simulations faster than their Intel and AMD counterparts.
</Hint>

## How To Use hCloud

Toggle your execution environment from local to hCloud by first clicking on the **Experiments** button in the playbar at the bottom of the screen, and then tapping the hCloud banner at the top of the menu.

![](https://cdn-us1.hash.ai/site/docs/screen-shot-2020-09-11-at-11.06.42-am.png)

In the background, your browser will establish a connection to our servers which once established will let you run experiments in the cloud in the same way as if you were running them locally.

<Hint style="info">
**Connecting to hCloud does not count against your account's allowance of free compute minutes.** Only time spent running simulations or experiments contributes towards your cap, or results in billing thereafter. Generally, therefore, it makes sense to leave hCloud enabled.
</Hint>

### hCloud Compute Minutes

hCloud resources are billed through a composite metric, hCloud Minutes/Seconds. Currently this is calculated as the amount of time spent executing a simulation on an hCloud server per vCPU.

In our current _Early Access_ phase, by default all simulation run using a single vCPU.

Let's take a look at two examples:

1.  **I'm building a simulation and I want to try to run a larger simulation with more agents than I can do it on my local machine.** I've set the `number_of_agents` in my globals, so I create an experiment with 10x the number and then toggle the Cloud Runner button to connect to cloud and run the experiment for 100 steps. Each execution of a run, from start to finish, will count towards your cloud minute \(not including connect/upload/download times\). _If it takes about a second to generate a state for this simulation the total billed time would be 100 cloud seconds._
1.  **After iterating on my simulation I'm confident the underlying logic is correct and I'm ready to start exploring the effect of different parameters on the outcomes of simulations.** I create a linear space [experiment](/docs/simulation/creating-simulations/experiments/) that will sample ten times from a range of 1 to 100, and will run for 500 time steps. This creates ten separate simulations that each run for around 50 seconds to 60 seconds. _In this second example the total time used would be between 8.3 to 10 minutes._

### hCloud Distributed Compute

hCloud runs experiment runs in a parallelized fashion by default on HASH **Free**, **Base**, and **Pro** accounts. In practice this means the memory available to your simulation varies from 4-192GB, depending on your account limits.

<Hint style="success">
If you're interested in running larger-scale simulations, or want to distribute a single run across multiple instances, [contact us](/contact) to learn more about upgrading to a paid version of HASH.
</Hint>

<Hint style="info">
**HASH Enterprise** is required to run "unbounded" models, and distribute single runs across multiple instances in hCloud. [Contact us](/contact) to register an interest.
</Hint>
