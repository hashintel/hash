---
title: Initializing Agents
slug: simulation/creating-simulations/anatomy-of-an-agent/initial-state
objectId: e7dddeb1-246b-4287-b26c-b91d79fde3c4
description: Where simulated life begins
---

# Initializing Agents

All HASH simulations begin life in the `init` file found in the root of a HASH project. In this file we generate the starting state, or _initial conditions_ of the simulated world.

There are three ways to populate the initial state of a simulation. You can:

1.  Define the individual agents in `init.json`
1.  Define "creator" agents in `init.json` with behaviors that will generate agents
1.  Programmatically generate the initial agents directly in an `init.js` or `init.py` file.

## init.json

In `init.json` you'll explicitly define all your agents as JSON blobs in an array. Here's what that might look like:

![Defining five agents in init.json](https://cdn-us1.hash.ai/site/docs/screen-shot-2020-05-30-at-5.41.03-pm.png)

You can create whatever field names you need on your agents, but be aware of setting incorrect value types on protected fields we mentioned previously.

**init.json**

```text
[
    {"position": [0,0],
     "behaviors": ["foo.js"]},
    {"position": [0,0],
     "behaviors": ["foo.js"]},
]
```

When you make a change to the file, you'll need to reset your simulation to see updated agents appear in the 3D Viewer.

## init.js and init.py

The default `init.json` approach has some limitations. Because it's compliant JSON, you can't set dynamically set properties on the agent. If you want to generate random values, or run loops to generate your agents, then `init.js` or `init.py` will give you that functionality.

You can transform the `init.json` file into a JavaScript or Python file by right clicking it and selecting "Convert to..." your desired language.

![](https://cdn-us1.hash.ai/site/docs/image%20%2864%29.png)

When you do, any defined agents will be added as objects in an array named `agents`.

![](https://cdn-us1.hash.ai/site/docs/image%20%2863%29.png)

Now you can write JavaScript or Python in the file and use it to set agent properties.

<Tabs>
<Tab title="JavaScript" >

```javascript
const init = (context) => {
  let agents = [
    {
      position: [0, 0],
      behaviors: ["custom.js"],
      foo: Math.random(),
      data: context.data()["/somedataset"][1],
    },
  ];

  return agents;
};
```

</Tab>

<Tab title="Python" >

```python
import random

def init(context):
  agents = [
    {
      "position": [0,0],
      "behaviors": ["custom.py"],
      "foo": random.random(),
      "data": context.data()["/somedataset"][1]
    }
  ]

  return agents
```

</Tab>
</Tabs>

<Hint style="warning">
`init.js` and `init.py` must return an array of objects
</Hint>

To programmatically create agents, you can add loops and similar logic to append agents to the array.

<Tabs>
<Tab title="JavaScript" >

```javascript
const init = (context) => {
  let agents = [];
  for (let i = 0; i < 100; i++) {
    agents.push({
      position: [i, i],
    });
  }
  return agents;
};
```

</Tab>

<Tab title="Python" >

```python
def init(context):
    return [{ "position": [i,i] } for i in range(0,100)]
```

</Tab>
</Tabs>

Within an `init.js` or `init.py` file you have access to the [context](/docs/simulation/creating-simulations/anatomy-of-an-agent/context) of the simulation, where you can access the data and global variables attached to the simulation. You can use them to seed values in your initialization.

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

<Hint style="info">
The `context` object in the **init** file is slightly different from the context available during a simulation run. Neighbors and messages won't be available as they don't exist before a simulation starts.
</Hint>

You can also make use of functions in HASH's standard library to generate agents in predefined patterns.

```javascript
const init = (context) => {
  const topology = context.globals().topology;
  const template = {
    behaviors: ["grow.js"],
    color: "yellow",
  };

  const agents = hstd.init.grid(topology, template);
  return agents;
};
```

You can learn more about all the **init** functions in the standard library [in this section of the docs](/docs/simulation/creating-simulations/libraries/hash/init).
