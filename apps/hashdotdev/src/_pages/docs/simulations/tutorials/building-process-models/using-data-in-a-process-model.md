---
title: Adding Data to a Process Model
slug: simulation/tutorials/building-process-models/using-data-in-a-process-model
objectId: ee3bd846-664d-46f7-bf31-196fa6f57a17
---

# Adding Data to a Process Model

You can use your real world business data to power your process model and create a digital twin of your business process.

In this how-to guide we'll cover:

- How to load data into a process model
- How to customize parameters of a process model using datasets
- An example using a dataset of customer service employees to inform a ticketing queue support process

## Loading Data

<Hint style="info">
For more on using data in HASH, see [Datasets](/docs/simulation/creating-simulations/datasets/)
</Hint>

HASH supports CSV and JSON datasets. You can upload your dataset by clicking the 'New Dataset' option in the editor. Or, by finding/reusing an existing dataset on [hIndex](/index) and adding it to the simulation.

The dataset is stored in the 'data/' folder, and the data will be available in the simulation through `context.data()`.

<Tabs>
<Tab title="JavaScript" >

```javascript
const behavior = (state, context) => {
  let cs = context.data()["CustomerServiceEmployeesSheet1.csv"];
};
```

</Tab>

<Tab title="Python" >

```python
def behavior(state, context):
  cs = context.data()["CustomerServiceEmployeesSheet1.csv"]
```

</Tab>
</Tabs>

## Customizing Parameters

With the data loaded in the simulation we can use it to power the process model. There are many different ways to use data with process models, but the most common are:

- Set the properties of the process model. For example, if a pizza delivery service model has a certain number of drivers available to deliver pizzas, they could use a dataset to set that number.
- Create distributions for modeling uncertainty. Now, if the pizza delivery service wants to estimate the number of orders they'll get in a day, they could take a dataset that captures last weeks orders of pizzas, choose a distribution that accurately models the data, and then use that to simulate new orders.

<Hint style="info">
Learn more about modeling uncertainty in [Designing with Distributions.](/docs/simulation/concepts/designing-with-distributions)
</Hint>

## Example: Customer Service Data

A common business process simulation is the ticket support queue. Tickets from users come in and arrive in a queue. An available customer service agent takes a ticket, solves it, and then picks up the next ticket.

This process would have three elements:

- At the beginning, a **source** block that generates tickets
- At the end, a **sink** block that collects finished tickets
- In the middle, a **service** block where customer service workers take tickets and work on them. When a CS employee is working a ticket, they can't take a different ticket until they finish.

<Hint style="info">
For more on the different blocks and when to use a given block, see [Process Model Concepts](/docs/simulation/concepts/designing-with-process-models/process-model-concepts)
</Hint>

![A simple customer service process model](https://cdn-us1.hash.ai/site/docs/image%20%2848%29.png)

Using the Process Model Builder, we can set properties for each of the blocks and update my simulation with it. The resulting code will look like:

```javascript
const agent = {
  agent_name: "process_model",
  behaviors: [
    "@hash/age/age.rs",
    "@hash/process/source.js",
    "@hash/process/service.js",
    "@hash/process/sink.js",
  ],
  process_labels: ["", "start", "work_on_tickets", "solved_tickets"],
  process_parameters: {
    start: {
      template: {},
      frequency: 1,
      rate: null,
      next_block: "work_on_tickets",
    },
    work_on_tickets: {
      time: 1,
      resource: "cs_employees",
      next_block: "solved_tickets",
    },
    solved_tickets: {},
  },
  position: [0, 0, 0],
};
```

Now we can take a [dataset defining different customer service employees](https://docs.google.com/spreadsheets/d/1dFSnjdBqbovplPwWo7DI77AX8rXWOmVQi1dW8c0l1-k/edit?usp=sharing), download it as a CSV, load it into the simulation, and use the data to set the number of CS employees we have on hand.

```javascript
  // create_process_from_chart.js

 "start": {
        "template": {},
        "frequency": 1,
        "rate": null,
        "next_block": "work_on_tickets"
      },
      "work_on_tickets": {
        "time": 1,
        "resource": "cs_employees",
        "next_block": "solved_tickets"
      },
      "solved_tickets": {}
    },
    //added a line for the cs_employees resource
  "cs_employees": context.data()["ExampleCustomerServiceEmployeesSheet1.csv"].length
}
```

This is a good start, but to make the model more realistic we can add a dataset representing ticket volumes over the past five days. I'll take the mean and standard deviation of the data, and set a triangular distribution for the number of tickets to generate every time step.

```javascript
// create_process_from_chart.js

 const { triangular } = hstd.stats;
 let tickets = context.data()["Tickets.csv"];
 //Get min and max number of tickets received per day
 let min = tickets.reduce((min, t) => t.count < min ? t.count : min, data[0].count);
 let max = tickets.reduce((max, t) => t.count > max ? t.count : max, data[0].count);
 //Get the mode of the array and average with min and max to find the peak
 let peak = (min + max + mode(tickets)) / 3;

 //in the process parameters ...

 "process_parameters": {
      "start": {
        "template": {},
        "frequency": 1,
        "rate": triangular.sample(min, max, peak),
        "next_block": "work_on_tickets"
      },
      "work_on_tickets": {
        "time": 1,
        "resource": "cs_employees",
        "next_block": "solved_tickets"
      },
      "solved_tickets": {}
    }

```

Now when we we run the simulation, we have a good estimate of what my customer service process will look like using real world data.
