---
title: Programmable Initialization
slug: simulation/creating-simulations/anatomy-of-an-agent/programmable-initial-states
objectId: 13e5ee9e-1c0e-4ffe-be93-739606ed9af6
description: Initializing simulations with JavaScript and Python
---

# Programmable Initialization

By default, all new simulation projects in HASH start with an `init.json` file for specifying the initial state. If desired, you can convert this `init.json` file to Python `init.py`, or Javascript `init.js` by right-clicking on the init file and choosing your desired conversion.

Python and Javascript init files provide access to the simulation globals and data, and are useful for dynamically initializing a simulation. When using `init.js` or `init.py`, you typically won't need to use creator agents.

Both Javascript and Python init files must contain a function called `init` which returns a list of agents. The `init` function takes a single argument called `context` which provides access to the simulation `globals` and `data`.

<Tabs>
<Tab title="JavaScript" >

```javascript
/**
 * @param {InitContext} initialization context
 */
const init = (context) => {
  const data = context.data();
  const globals = context.globals();

  let avg_age = hstd.stats.mean(data["ages.json"]);
  let std_age = hstd.stats.stdev(data["ages.json"]);

  let agents = [];
  for (let i = 0; i < globals["num_agents"]; i++) {
    agents.push({
      behaviors: ["add_one.js"],
      age: Math.floor(hstd.stats.normal.sample(avg_age, std_age)),
    });
  }

  return agents;
};
```

</Tab>

<Tab title="Python" >

```python
import statistics
import random


def init(context):
  data = context.data()
  gbls = context.globals()

  avg_age = statistics.mean(data["ages.json"])
  std_age = statistics.stdev(data["ages.json"])

  agents = []
  for i in range(gbls["num_agents"]):
    agents.append({
      "behaviors": ["add_one.js"],
      "age": int(random.gauss(avg_age, std_age)),
    })

  return agents
```

</Tab>
</Tabs>
