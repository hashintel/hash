# Analyzing Process Models

Once you've created your process model, you'll want to use it to answer questions about its performance. Creating plots will make it easy and visually engaging to interpret the results of your simulation runs.

‌The Process Modeling Library is designed to let you easily access metrics in three different areas: task completions, timing, and resource usage. Examples of all of these can be found in the simulation attached to the [process modeling library project.](https://core.hash.ai/@hash/process/stable)

## Task Completions

![Counting objects that make it from a source to a sink](https://lh6.googleusercontent.com/FpkhPVYVzOMsDXWZ5GU1pMJ1NLUEI0ddJ4pIFFN1BNcdJjnQRByxupbwkzVPgNpyVqJL1eVOq3A0HJdNlWnQJ7oXQAURcIoBHqh4y9-SgEpiXDlX2VyKLL74XOV4NB0hn_SRHsK9)

Sink blocks are end-points in a process model. As objects reach them they are counted, representing completed tasks on a production line, a delivery chain, a quality inspection, etc.. The Sink block automatically stores information about objects it receives in the process\_data field on your agent.

You can easily build plots to access this information. Each Sink stores its data under a key formatted as '&lt;sink\_name&gt;\_count'. A metric which accesses the data for the above graph would look like:

![The Pizzas Delivered chart can be generated using this metric definition.](https://lh3.googleusercontent.com/c_DmTlg1_LZtwGVB5Nx8VSDsXmiOtYmgYpBkPci3eJwzm250_Z45MTRtBjE8YP3lmMRTp99Z7G2xYRR5B1URmNOxJz2CUs0bSLM9EI2nw1txwu85iElGZdWJofiq5iUUysiSt-xY)

## Timing

![Recording the average time objects spend in the process model](https://lh5.googleusercontent.com/vWCTGpdXJcm8TnBCjvXwJo5PnIM6zdX5jvnv26x4FOpd68NI9w6XGYa2Mv8smTUedHJCc3gnHRcf30O1CMnTxZQS9qkViqioaZs8BgPIUoARfymyZeEuKC5UPmzKJ80Ddm4DeY0Q)

Process models are useful for timing complex chains of actions. Service blocks will record the time spent waiting for resources to become available.

Sink blocks will record all the waits an object experienced, as well as the total time it took it to traverse the model. To specify a timing plot, first create metrics which access the appropriate '&lt;service\_name&gt;\_wait\_time' and '&lt;sink\_name&gt;\_through\_time' , which are located in the `process_data` field on the agent. Then specify a "timeseries" plot with those metrics. Note that "wait times" are keyed to a Service block, while "through times" are keyed to a Sink.

![](../../.gitbook/assets/image%20%2852%29.png)

## Resource Usage

![Visualizing the utilization of different resources in a process model](https://lh5.googleusercontent.com/2uML2JYITbiTbPOJb6ajbO_bQcScgO_7UwA_7umszwbeC5zlxcH6bpQ_0kojqRoXVaABEJnS8ZHkddVMwf4qZMW2hMv_tzFr0idCyNvKBRfq-DSxeO6RPX3hb2IiNGD27Ds_QT6y)

Each Service, Seize, or Release block in your process model has an associated resource property specified in its parameters. 

<Tabs>
{% tab title="Service Block" %}
```javascript
"bake_pizza": {
  "resource": "oven_spots",
  "time": 7,
  "track_wait": true,
  "max_resources": 5
}
```
</Tab>

{% tab title="Seize Block" %}
```javascript
"prep_spot": {
  "resource": "spots",
  "track_wait": true
 }
```
</Tab>

{% tab title="Release Block" %}
```javascript
"peel_pizza": {
  "resource": "spots",
  "max_resources": 8
}
```
</Tab>
</Tabs>

If you'd like to have easy access to data about the usage of each of these resources, you can add the `@hash/process/resource_data.js` behavior to your agent. This behavior calculates the proportion of resources currently in use, and stores the data in the process\_data field.

To use the behavior, you'll also need to specify a new object in process\_parameters:

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





