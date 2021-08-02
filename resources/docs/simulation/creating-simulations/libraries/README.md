# Libraries

## HASH Standard Library

HASH provides a set of useful functions to help simplify simulation construction through a standard library, `hstd`. The Python language environment [also provides access to a wide array of scientific Python packages](python-packages.md)_._

You can contribute to the HASH standard library by submitting pull requests to our [open source repo](https://github.com/hashintel/hash/tree/master/packages/engine/stdlib).

{% embed url="https://youtu.be/0pABnjlWjPY" caption="Using HASH Standard Library Functions" >

### Types of functions in the HASH Standard Library

The HASH Standard Library contains the following types of functions:

| Category | Description |
| :--- | :--- |
| [Spatial](hash/spatial.md) | Functions describing and modifying the location of agents in x,y,z space. |
| [Init](hash/init.md) | Functions for initializing a simulation with new agents. |
| [Neighbors](hash/neighbors.md) | Functions related to neighbors and neighbor calculations. |
| [Statistical](hash/javascript-libraries.md) | Functions for performing complex statistical modeling or analysis. |
| [Random](hash/random.md) | Functions related to random number generation |
| [Agent](hash/agent.md) | Functions for helping build and use agents. |

### Using the HASH Standard Library

To call a standard library function, use the `hash_stblib` object followed by the function name, for example:

```javascript
function behavior(state, context) {
    let distance = hstd.distanceBetween(agentA, agentB)
}
```

## Scientific Python

HASH provides access to a number of scientific Python packages which can be utilized in simulations. [Read more &gt;](https://docs.hash.ai/core/libraries/python-packages)

