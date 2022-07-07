---
title: Full Initialization
slug: simulation/extra/migrating/anylogic/building-the-simulation/full-initialization
objectId: aadcc558-465d-4877-b859-c777344d5dca
---

# Full Initialization

We've built all our logic to run this simulation, but we want to have more than just one agent of each type in our model. We're going to create a dataset to represent a network of ports, refineries, storages, etc. and use it to initialize our model. We'll also import some historical oil supply data to populate the demand gas stations experience.

## Initializing from a Network

In the AnyLogic model, the agents are initialized from a database. When the simulation starts, all of the agent values are filled in from individual properties in the db.

![](https://cdn-us1.hash.ai/site/docs/image%20%2828%29.png)

In HASH, we provide similar functionality through the [HASH Index](/platform/index) \(hIndex\). The hIndex is a place you can find existing data or upload your own \(privately or publicly\). In this case, we’ve created an [example dataset](/@hash/ex) for the simulation that contains a network representation of the system. Now in the simulation we can upload the dataset and, in a create function, spin up agents with those properties.

```python
# initialize.py

pipelines = context.data()['@hash/ex/oil_pipelines.json']
G = nx.node_link_graph(pipelines)

for loc in pipelines['nodes']:
    if loc['type'] == 'port':
        # Create Ports
    elif loc['type'] == 'refinery':
        # Create Refineries
    elif loc['type'] == 'storage':
        # Create Storages
    elif loc['type'] == 'distributor':
        # Create Distributors
    elif loc['type'] == 'retailer'
        # Create Retailers
```

Our creator function will parse the dataset and assign the necessary properties and behaviors to every agent. An upcoming version of HASH will include a click-through wizard that will do this on your behalf.

## Initializing from Historical Data

We'll use another dataset to determine the demand **Retailers** experience. The U.S Energy Information Administration has a database that includes historical gasoline supply. We'll import [that dataset](/@useia/petrol-and-liquids) and write a behavior to process the data, and allow our `initialize.js` file to use it in assigning the `avg_demand` for **Retailers**

```javascript
// process_data.js

const behavior = (state, context) => {
  const data = context.data()["@useia/petrol-and-liquids/week-supply-gas.csv"];

  // Average data so that we can access it as a yearly average.
  // Users can then specify a year to use in globals.json
  let yearly_supply = {};

  for (line of data) {
    const year = line[0].split("/")[2];
    const supply = Number(line[1]);

    // Skip NaN values
    if (isNaN(year)) {
      continue;
    }

    if (yearly_supply[year]) {
      yearly_supply[year].push(supply);
    } else {
      yearly_supply[year] = [supply];
    }
  }

  for (year in yearly_supply) {
    const supply = yearly_supply[year];
    yearly_supply[year] = hstd.stats.sum(supply) / supply.length;
  }

  state.set("yearly_supply", yearly_supply);
};
```
