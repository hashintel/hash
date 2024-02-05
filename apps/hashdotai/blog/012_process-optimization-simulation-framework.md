---
title: "Simulating Constraints: A Framework for Process Optimization"
date: "2021-04-05"
categories: 
  - "Simulation"
---

[](https://github.com/hashintel/docs/blob/master/extra/theory-of-constraints-and-simulations-a-framework-for-process-optimization.md)Simulating process models is a powerful technique for understanding and optimizing work processes. And like most powerful techniques, it's important to have a framework for applying it, to help use it in a way that's beneficial and aligned with management objectives.

What follows is a suggested approach for using simulations to generate insights about your work processes, applying it within the [Theory of Constraints](https://en.wikipedia.org/wiki/Theory_of_constraints) paradigm. Introduced and popularized by Eliyahu Goldratt in [the book the Goal](https://en.wikipedia.org/wiki/The_Goal_(novel)), it's a management philosophy driven by the key insight that the **constraints** in your work processes determine the speed, efficiency, and overall performance of the operation. This applies whether you're managing a manufacturing line, a customer service desk, or any kind of defined process - focusing on improving the constraints will unlock the most value.

The benefit of simulation, when applied with this framework, are numerous. Simulation helps you identify constraints, helps you experiment in a virtual environment with different solutions, and shows what the system would look like with the constraints alleviated. Compared with more traditional methods, simulation can save orders of magnitude of experimentation costs, and you can get results at the speed of silicon (fast!).

There are five steps in the theory of constraints framework:

1. Identify the system's constraints: Model the system and find the bottlenecks.

3. Decide how to exploit the system's constraints: Test different strategies for alleviating bottlenecks.

5. Subordinate everything else to the above decisions: Make the case using graphs and experiments.

7. Elevate the constraints: Upgrade the necessary components, buy more of the resources, increase capacity, etc.

9. Repeat: After the targeted intervention, if successful the constraint will shift to another resource. Repeat the above process, practicing the art of continuous improvement.

The theory of constraints offers guidelines and heuristic for modeling processes and identifying actions to take; however, it doesn't provide specific tools and scientific approaches for analyzing systems. That's where simulation can help. This article will walk through applying the theory of constraints + simulations, and include examples and principles for applying it to your own problems.

# Identify the system's constraints[](#identify-the-systems-constraints)

A constraint is anything that limits a system or prevents it from achieving a goal. It's important to identify the constraint in the system before beginning to optimize - failure to do so can lead to wasted efforts and minimal results.

It's ironic that when trying to improve a process, people have a tendency to focus their efforts on the least leveraged part of the problem, and neglect to identify or quantify the most important parts. Douglas Hubbard, in his book [How to Measure Anything](https://hubbardresearch.com/publications/how-to-measure-anything-book/) calls this the “Measurement Inversion”:

> In a business case, the economic value of measuring a variable is usually inversely proportional to how much measurement attention it usually gets.

For example, consider a [Billing Department](https://hash.ai/@hash/billing-department-process), which needs to process, send out, and occasionally audit two types of bills.

![](images/update_process-models-alt.png)

[_Learn how to build a process model simulation using a visual interface._](https://docs.hash.ai/core/concepts/designing-with-process-models/using-the-process-model-builder)

Once we've represented the department as a process model and generated a simulation, we can use the Analysis view to inspect the process models to identify bottlenecks based on resource utilization or through times. There are four different resources in use in model: `senior_billers`, `account_billers`, `billing_clerks`, and `printers`. Visualizing the average utilization of these resources will allow us to determine which, if any, are responsible for any bottlenecks:

![](images/billng-department-resource-utilization.png)

Percent of a resource being utilized

We can see that Senior Billers are almost constantly occupied, compared to other resources, which have more reasonable usage rates.

Paradoxically, having a resource fully occupied implies that a system is not running effectively. We can confirm that by looking at the average time it is taking to process a bill:

![](images/avg-process-time-increases.png)

The average time continues to increase as the model runs, instead of reaching a stable value. This means that eventually the system will take infinitely long to process a bill!

Through simulation we can see identify an important principle, **increasing utilization of a resource increases work in progress and waiting times** ([related: a nice short description of why](https://archive.vn/Xrb9a)). In our billing department model, the increasing utilization of senior billers causes through times to explode. This is our constraint.

# Decide how to exploit the system's constraints[](#decide-how-to-exploit-the-systems-constraints)

Now that we know where the key constraint in the system is, we can re-engineer our process to alleviate the constraint.

### Improving the system design[](#improving-the-system-design)

One of the tricky parts of process modeling and process optimization is it can be non-obvious how different process designs impact process performance. Subtle differences can lead to dramatically different outcomes. The key to improving a system often comes from experimentation with different layouts; these can be guided by principled insights from operations research or through iteration, and trial and error. A benefit of using simulation as an aid in the design process is you can quickly experiment with different designs.

In our example of the billing department senior\_billers are used in `auditCustomerAccount`, `verifyAndFixBills`, and in `registerARAndFinancials`. Regardless of the path the bills take in the process, they end up utilizing some of the senior\_billers resource. A potential improvement might be to redesign the system such that the senior\_billers are no longer used on all parts, and instead conserving their input until the end.

### Adding resources or buffers to a bottleneck[](#adding-resources-or-buffers-to-a-bottleneck)

If time is lost at a non-bottleneck component, it probably won't impact the throughput or average time of the system, as there is slack within the system to make up for the loss. However, if items are delayed at the bottleneck component, it will almost certainly have a negative impact on the system performance.

To improve the performance at the bottleneck, you can add resources or a buffer. **Resources** can be thought of as whatever inputs are necessary to facilitate the bottleneck process, while a **buffer** is a temporary storage area that ensures that there is always work/resources available for the bottleneck. For instance, in manufacturing, you can think of a buffer as keeping a stock of inputs on hand for a machine to consume. If there's no buffer, there might be periods where the machine sits idle with nothing to do; or, if it's overloaded with inputs, no place to store the inputs (ex. a server that runs out of RAM buffer space might need to do a costly memory swap with physical storage).

By adding more senior billers to the key service blocks, and keeping a larger backup buffer of senior billers in reserve, we dramatically reduce the total utilization of that resource at any one time, likely improving performing.

![](https://gblobscdn.gitbook.com/assets%2F-M3CpctISatx3qXBSyvk%2F-MX4gL1V2nSMgY5xji9R%2F-MX4hND7uptN8RHLgJhY%2Fimage.png?alt=media&token=c6b51f89-ff66-492e-9714-e7aa2820d782)

Senior billers utilization with 11 billers

### Single vs Multiple Queues[](#single-vs-multiple-queues)

In some systems, a bottleneck may be caused not by the number of resources available, but by the way those resources are accessed. As a rule of thumb, if tasks are separated among separated sets of resources, it can produce inefficiencies. Luckily, our Billing model doesn't run into this constraint. Different Senior Billers can all pull new audits from the same pile, they don't have separate sets they need to complete.

However, consider this [simple simulation of a set of four call centers](https://core.hash.ai/@hash/interconnected-call-center-single-agent/1.0.0). Customers call in, and then are answered if there is an available employee. Note that they cannot route calls between centers; if I call Center A, my call has to be answered by Center A.

![](https://lh6.googleusercontent.com/wdM5ern1vU4MaHGMzBSseY11dMWb0RRHfFimooXK_ny580u0ft7czlNDe180liiBKwtuaSzDlfcyX2mSq5lpwYU8vs5iGfC77EGMnLAtKPArBYlyHtO3jbjaoJ_ZEooiMW1NcxQc)

Four call centers, all with different queues

In the presence of large variability in call frequency, this can create over and under-utilized centers, leading to large increases in waiting time. But if all incoming calls can be routed between Centers (effectively creating a single queue), we expect to see much more efficient service, since calls can be distributed evenly.

![](https://lh5.googleusercontent.com/AMFD9CKR0W2kBhWwytL_O-UwY61zwtPqqDAIaM1tbKIfcjU_F-2_Qi8KM_NFDlUSaug242CIZolBQH6AoImL4QJBQFljychdvD6WBzRjosc1zoZguJIkvaCIhiFjmd2lFclndzWx)

Four call centers with one incoming queue of calls.

If we run an experiment to compare the two queue orientations see that the 4 centers can answer nearly the same number of calls, with much greater efficiency, meaning reduced wait times.

![](https://gblobscdn.gitbook.com/assets%2F-M3CpctISatx3qXBSyvk%2F-MX7_88PG6VhK02jYveG%2F-MX7pYrwxVoy5383ahRs%2Fimage.png?alt=media&token=f7b98abb-ffac-4eae-9161-83908136e437)

Average wait time for calls in both orientations

![](https://gblobscdn.gitbook.com/assets%2F-M3CpctISatx3qXBSyvk%2F-MX7_88PG6VhK02jYveG%2F-MX7q83txqfI_UIbjowk%2Fimage.png?alt=media&token=739f6aa2-d906-42ef-bba5-e8cdb08d552e)

Calls answered in both orientations

Indeed, we can see that the single-queue orientation manages to answer more calls, with much-reduced wait times that don't grow over time.

# Subordinate everything else to the above decisions[](#subordinate-everything-else-to-the-above-decisions)

It's not enough to have found the solution to the problem - a good process engineer needs to prioritize and execute on the solution. This is easier said than done. When dealing with complex systems it's easy to get distracted by low-impact interventions, and aligning the full team behind the highest value intervention requires communicating the potential results of an intervention in a visually compelling manner.

We encourage you to use the built-in metrics, plot, and experiments with HASH to 'make the case' for a given process change. You can see the potential outcomes of your changes, and you and your team can experiment with different parameters and setups, getting buy-in.

To explore the effects of different parameters, try creating an experiment to see what the optimum number of senior billers is:

![](https://gblobscdn.gitbook.com/assets%2F-M3CpctISatx3qXBSyvk%2F-MX4gL1V2nSMgY5xji9R%2F-MX4hmWz_mvWjfNLBLDA%2FC11907E2-ADF2-48E6-85CE-C2BB3CBDC048-464-0003638BFFBF8C41.png?alt=media&token=5208f190-45eb-4ff7-a22d-90d9cb86033c)

Vary the number of senior billers

Then, when you run the experiment, you can click through the plots and view the effect that different numbers of billers have on the simulation:

![](https://gblobscdn.gitbook.com/assets%2F-M3CpctISatx3qXBSyvk%2F-MX4gL1V2nSMgY5xji9R%2F-MX4htlBUretTYUGecXg%2F2B2E1B70-0249-4F90-A22E-8E033001D780-464-00036392CAC553AB.png?alt=media&token=3a071ba7-7d4a-4a25-b2e2-c908a0b72d9f)

Through time with 11 senior billers

_See [Analyzi](/core/concepts/designing-with-process-models/analyzing-process-models)[n](https://docs.hash.ai/core/concepts/designing-with-process-models/analyzing-process-models)[g Process Models](/core/concepts/designing-with-process-models/analyzing-process-models) for more on graphing process models, and Collaboration to learn how to share a process model simulation with your team._

# Alleviate the system constraints[](#alleviate-the-system-constraints)

Alleviating the constraints means investing in them until they are no longer the constraints. We can track the performance of our improvements by using real world data to inform the parameters we set on a process model. As more resources are added, or as the process changes, we can update the simulation to see over time whether the constraint has been broken.

_Read about [Adding Data to a Process Model](https://docs.hash.ai/core/concepts/designing-with-process-models/using-data-in-a-process-model)._

In the example, we can take it and update the parameters as new data about the process arrives. When new data arrives or the process changes, we can create a new release that provides an updated view on the reality of the process.

# Repeat[](#repeat)

Once you've improved your constraints, you'll find the system working better than before. But process optimization isn't a one-off process; it's a continuous process for creating continuous improvement. Once the first constraint is improved, a new part of the system will emerge as the bottleneck for performance, and you can reuse this framework (and the simulation you've built) to find, exploit, subordinate, and alleviate the constraints.
