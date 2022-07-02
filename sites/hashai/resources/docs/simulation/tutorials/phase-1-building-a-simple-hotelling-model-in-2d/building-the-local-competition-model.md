---
title: Extending the Model
slug: simulation/tutorials/phase-1-building-a-simple-hotelling-model-in-2d/building-the-local-competition-model
objectId: 6936eac9-32d4-4593-8dde-ce45ceba8d39
description: Adding complexity to the simulation
---

# Extending the Model

We've just created a relatively simple model to demonstrate some features of competition on a spatial basis. We can try to extend this into a more realistic model of local competition by adding on some more complex behaviors, and integrating real-world data. If we think of this in phases, it might look something like this:

- **Phase 1** - Building a simple Hotelling model in 2D
- **Phase 2** - Introduces more realistic behavior for businesses and customers, and creates a more realistic environment
- **Phase 3** - Add real world data

We can add a new type of agent which represents the actual locations that a business can occupy \(since they can't actually move around to anywhere they would like\). Different location will have varying rents as well.

- **Location -** represent lots/storefronts that Businesses may occupy in the environment. Each Location agent has a square footage size and rent cost.

We can then find some data with information about vacant storefronts in a city, to finish extending the model. Check out the [Local Competition model](/@hash/local-competition) to see how we've implemented these extensions.

![Locations of businesses and customers in HASH's geospatial view](https://cdn-us1.hash.ai/site/docs/screen-shot-2020-06-24-at-4.56.47-pm.png)
