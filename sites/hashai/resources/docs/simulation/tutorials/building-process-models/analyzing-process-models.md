---
title: Analyzing Process Models
slug: simulation/tutorials/building-process-models/analyzing-process-models
objectId: 71393281-6569-46d3-a308-8445c79a3553
---

# Analyzing Process Models

Once you've created your process model, you'll want to use it to answer questions about its performance. Creating plots will make it easy and visually engaging to interpret the results of your simulation runs.

‌The Process Modeling Library is designed to let you easily access metrics in three different areas: task completions, timing, and resource usage. Examples of all of these can be found in the simulation attached to the [process modeling library project.](https://core.hash.ai/@hash/process/stable)

## Task Completions

![Counting objects that make it from a source to a sink](https://cdn-us1.hash.ai/site/docs/analysis-pizzas-delivered.png)

Sink blocks are end-points in a process model. As objects reach them they are counted, representing completed tasks on a production line, a delivery chain, a quality inspection, etc.. The Sink block automatically stores information about objects it receives in the process_data field on your agent.

You can easily build plots to access this information. Each Sink stores its data under a key formatted as '&lt;sink_name&gt;\_count'. A metric which accesses the data for the above graph would look like:

![The Pizzas Delivered chart can be generated using this metric definition.](https://cdn-us1.hash.ai/site/docs/analysis-pizza-delivery-metric.png)

## Timing

![Recording the average time objects spend in the process model](https://cdn-us1.hash.ai/site/docs/analysis-times-plot.png)

Process models are useful for timing complex chains of actions. Service blocks will record the time spent waiting for resources to become available.

Sink blocks will record all the waits an object experienced, as well as the total time it took it to traverse the model. To specify a timing plot, first create metrics which access the appropriate '&lt;service_name&gt;\_wait_time' and '&lt;sink_name&gt;\_through_time' , which are located in the `process_data` field on the agent. Then specify a "timeseries" plot with those metrics. Note that "wait times" are keyed to a Service block, while "through times" are keyed to a Sink.

![](https://cdn-us1.hash.ai/site/docs/image%20%2852%29.png)

## Resource Usage

![Visualizing the utilization of different resources in a process model](https://cdn-us1.hash.ai/site/docs/analysis-resource-utilization.png)

Each Service, Seize, or Release block in your process model has an associated resource property specified in its parameters.

<Tabs>
<Tab title="Service Block" >

```javascript
"bake_pizza": {
  "resource": "oven_spots",
  "time": 7,
  "track_wait": true,
  "max_resources": 5
}
```

</Tab>

<Tab title="Seize Block" >

```javascript
"prep_spot": {
  "resource": "spots",
  "track_wait": true
 }
```

</Tab>

<Tab title="Release Block" >

```javascript
"peel_pizza": {
  "resource": "spots",
  "max_resources": 8
}
```

</Tab>
</Tabs>

If you'd like to have easy access to data about the usage of each of these resources, you can add the `@hash/process/resource_data.js` behavior to your agent. This behavior calculates the proportion of resources currently in use, and stores the data in the process_data field.

To use the behavior, you'll also need to specify a new object in process_parameters:

```javascript
"process_parameters": {
 "max_resources": {
   "senior_billers": 3,
   "account_billers": 4,
   "billing_clerks": 3,
   "printers": 1
 }
}
```
