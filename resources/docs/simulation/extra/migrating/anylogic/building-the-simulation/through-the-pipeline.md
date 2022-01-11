---
title: Through the Pipeline
slug: simulation/extra/migrating/anylogic/building-the-simulation/through-the-pipeline
objectId: 8c2cbfe4-fdc9-4121-a660-0edca6b24012
---

# Through the Pipeline

## Refinery

The refinery consists of the published flow behaviors to allow oil to flow in and out of it, as well as a `refine.js` behavior we'll construct. Note that we're receiving "crude" but sending "oil" through the flow behaviors.

We'll add the refining behavior now, which allows the agent to convert from crude to refined oil, making sure we don't exceed capacity or fall below 0.

```javascript
const behavior = (state, context) => {
  let crude = state.get("crude");
  let oil = state.get("oil");
  const refined_capacity = state.get("refined_capacity");

  let rate = state.get("refining_rate") * context.globals().seconds_per_step;

  if (crude - rate < 0) {
    rate = crude;
  } else if (oil + rate > refined_capacity) {
    rate = refined_capacity - oil;
  }

  crude -= rate;
  oil += rate;

  state.set("crude", crude);
  state.set("oil", oil);
};
```

Keep in mind, as we're adding behaviors, we should be testing the simulation to make sure the new behaviors work as intended.

Now let’s create a storage unit to receive oil from the refinery.

## Storage

The storage agent is quite simple at this point. All we have to do is use the two published behaviors for flows, and make sure that we're initializing the storage with the proper fields in the `intialize.js` file. Let's connect a distributor as the final step of this pipeline.

## Distributor

The distributor needs the `Flow In` behavior, and a custom behavior which will respond to order requests from **Retailers**. We'll wait until we've initialized a **Retailer** before writing that, so that we can test it properly.
