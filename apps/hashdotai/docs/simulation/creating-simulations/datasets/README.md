---
title: Datasets
slug: simulation/creating-simulations/datasets
objectId: d784acc8-ffd5-4299-8e54-ab64011b3cea
---

# Datasets

**Data can be used in HASH to instantiate agents in a simulation, to set the properties of agents, or to influence any part of the simulation.**

HASH allows you to incorporate your own data into simulations, or download datasets from [hIndex](/index) to use in a simulation.

Example Simulations that use datasets:

- [City Infection Model](https://core.hash.ai/@hash/city-infection-model/main)
- [Local Competition](/@hash/local-competition)
- [Wholesale Warehouse](/@hash/wholesale-warehouse1)

## Importing data into HASH

To import your own datasets into HASH, click the 'Add Dataset' button above the list of files in hCore, and select a CSV or JSON dataset from your computer to upload:

![Click on 'New Dataset' to upload a dataset](https://cdn-us1.hash.ai/site/docs/screenshot-2021-02-04-at-17.24.13.png)

Once uploaded the dataset will be listed in your simulation's file list.

There are also third-party datasets published in hIndex you can add to your project, by searching in the "Add to Simulation" interface in the bottom-left hand corner of hCore.

<Hint style="info">
**Coming soon:** data syncing from remote sources is currently only achievable through [HASH Engine](/platform/engine), but will be soon be available in [HASH Core](/platform/core), via [HASH](/platform/hash).
</Hint>

<Hint style="success">
**Let us know which integrations you'd like to see natively supported by completing our** [**data connectors survey**](https://sohostrategy.typeform.com/to/WROAmyhH)**.**
</Hint>

## Using data in projects

HASH parses imported datasets and generates a new field in `context.data()`with the file name. This contains the content of datasets associated in the simulation. At this time HASH supports datasets imported in CSV or JSON formats.

- If the dataset is a JSON document, it gets parsed for you directly.
- If a dataset is a CSV file, when we load it into your project we parse it into an array of arrays \(where each row is an array\). If you have a header row, it will be the first array. See **Using data to initialize agents** below for a worked example.

```javascript
[
  ["name", "age"],
  ["Bob", 32],
  ["Alice", 58],
];
```

To access a dataset, use its path on `context.data()`- you can find its path by right-clicking on it in your files list, and clicking 'copy path to clipboard'.

```javascript
// Access a dataset in your simulation
context.data()["dataset-path.csv"];
```

<Hint style="info">
**Coming soon:** we will be streamlining this process shortly, providing more optionality around parsing treatment, and expanding support for the types of datasets ingestible by HASH.
</Hint>

If you wish to explore the universe of data available in HASH outside of hCore, you can do so directly [within hIndex](/data?sort=popularity). As with behaviors, we encourage you to tag data in hIndex with the type of '[Thing](/schemas/Thing)' it represents. This ensures that the data can subsequently be easily discovered and reused.

### Using data to initialize agents

Initializing agents is one of the most common uses of data in HASH. In the [city infection model](https://core.hash.ai/@hash/city-infection-model/stable) you can see an example of using data to create agents with heterogenous values.

The simulation contains a file, `sf900homes100offices.csv`, that appropriately contains listings of 900 homes and 100 offices. Each row contains a different building with a different lat, lng location

```javascript
  use_def                     neighborhood           lat               long
0    Single Family Residential    Sunset/Parkside    -122.502183895904    37.763653457648
1    Single Family Residential    Bernal Heights    -122.4170591352    37.747528129366
```

An accompanying behavior, `gis_data_upload.js`, imports the data, performs transformations to it \(ex. cleaning the data, parsing it into floats\), and then pushes the data as objects into an array.

```javascript
let gis_data = context.data()["@b/property_data/sf900homes100offices.csv"]
...
let json_data = selected.map(row => ({
    "use_def": row[0],
    "neighborhood": row[1],
    "lat": parseFloat(row[2]),
    "lon": parseFloat(row[3]),
    "type": transform_type(row[0])
    })
  )
...
json_data.forEach(e => agents.push(e))
```

A third behavior, `create_agents.js`, then iterates through the agents array and [initializes the agents](/docs/simulation/tutorials/phase-1-building-a-simple-hotelling-model-in-2d/initialization).

Now the simulation has a collection of agents with unique positions derived from real world data.

### Using data to enrich agents

<Hint style="info">
This section on hydrating agents' properties with external data is coming soon.
</Hint>

### Using data to calibrate models

Datasets can be used to calibrate a model to find the parameters that best match the real world. Upload a dataset and create an optimization experiment that reduces the error between a run and the dataset - the HASH optimization engine will automatically identify the parameters that reduce the error the most.

<Hint style="success">
Read more and see an example in the [Complex Metrics section on Validating and Calibrating.](/docs/simulation/creating-simulations/experiments/optimization-experiments/complex-metrics#validating-and-calibrating)
</Hint>
