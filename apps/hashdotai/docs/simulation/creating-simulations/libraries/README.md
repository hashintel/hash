---
title: Libraries
slug: simulation/creating-simulations/libraries
objectId: b5d41ca2-e55b-4040-98dd-4d7035d6b7c9
---

# Libraries

## HASH Standard Library

HASH provides a set of useful functions to help simplify simulation construction through a standard library, `hstd`. The Python language environment [also provides access to a wide array of scientific Python packages](/docs/simulation/creating-simulations/libraries/python-packages)_._

You can contribute to the HASH standard library by submitting pull requests to our [open source repo](https://github.com/hashintel/hash/tree/main/apps/engine/stdlib).

<Embed type="youtube" url="https://youtu.be/0pABnjlWjPY" caption="Using HASH Standard Library Functions" />

### Types of functions in the HASH Standard Library

The HASH Standard Library contains the following types of functions:

<!-- prettier-ignore -->
| Category | Description |
| :--- | :--- |
| [Spatial](hash/spatial) | Functions describing and modifying the location of agents in x,y,z space. |
| [Init](hash/init) | Functions for initializing a simulation with new agents. |
| [Neighbors](hash/neighbors) | Functions related to neighbors and neighbor calculations. |
| [Statistical](hash/javascript-libraries) | Functions for performing complex statistical modeling or analysis. |
| [Random](hash/random) | Functions related to random number generation |
| [Agent](hash/agent) | Functions for helping build and use agents. |

### Using the HASH Standard Library

To call a standard library function, use the `hash_stblib` object followed by the function name, for example:

```javascript
function behavior(state, context) {
  let distance = hstd.distanceBetween(agentA, agentB);
}
```

## Scientific Python

HASH provides access to a number of scientific Python packages which can be utilized in simulations. [Read more &gt;](/docs/simulation/creating-simulations/libraries/python-packages)
