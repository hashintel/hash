# Libraries

## HASH Standard Library

HASH provides a set of functions through `hstd.` It contains common functions to simplify simulation construction.

`hstd` _is currently only available in JavaScript behaviors; however, we're expanding it to include Python functions._

```javascript
function behavior(state, context){
  //...
  let distance = hstd.distanceBetween(agentA, agentB)
}

```

### Spatial

```javascript
/**
 * Returns the specified distance between two agents.
 *  distance is one of the four distance functions supported by HASH,
 *  defaults to manhattan distance.
 * @param a
 * @param b
 * @param distance
 */
distanceBetween(agent, agent, distanceFunction = "manhattan")


/** Returns the unit vector of a vector
* @param vec an array of numbers
*/
normalizeVector(vec: number[])

/**
 * Returns a position array of x,y,z is set to true
 * @param topology the Context.globals().topology object
 * @param z_plane defaults to false
 */
randomPosition(topology: topology object, z_plane = false)
```

### Neighbors

```javascript
/**
 * Returns all neighbors that share an agent's position
 * @param agentA
 * @param neighbors - context.neighbors() array or array of agents
 * */
neighborsOnPosition(agentA: PotentialAgent, neighbors: PotentialAgent[])

/**
 * Returns all neighbors within a certain vision radius of an agent.
 * Defaults vision max_radius to 1, min_radius to 0
 * Default is 2D (z_axis set to false), set z_axis to true for 3D positions
 * @param agentA
 * @param neighbors - context.neighbors() array or array of agents
 * @param max_radius - defaults to 1
 * @param min_radius - defaults to 0
 * @param z_axis - defaults to false
 */
neighborsInRadius(
  agentA: PotentialAgent, 
  neighbors: PotentialAgent[], max_radius = 1,
  min_radius = 0,
  z_axis = false
) 

/**
 * Searches and returns all neighbors whose positions are in front of an agent.
 * Default is set to planer calculations and will return all neighbors located
 * in front of the plane created by the agent's direction
 *
 * Colinear - If set to true, will return all neighbors on the same line as agent a.
 * @param agentA
 * @param neighbors - context.neighbors() array or array of agents
 * @param colinear - defaults to false
 */
neighborsInFront(
  agentA: PotentialAgent,
  neighbors: PotentialAgent[],
  colinear = false
)

/**
 * Searches and returns all neighbors whose positions are behind an agent.
 * Default is set to planer calculations and will return all neighbors located
 * behind the plane created by the agent's direction
 *
 * Colinear - If set to true, will return all neighbors on the same line as agent a.
 * @param agentA
 * @param neighbors - context.neighbors() array or array of agents
 * @param colinear - defaults to false
 */

neighborsBehind(
  agentA: PotentialAgent,
  neighbors: PotentialAgent[],
  colinear = false
)
```

### Distributions

```javascript
stats.beta(alpha, beta)
stats.centralF(df1, df2)
stats.cauchy(local, scale)
stats.chisquare(dof)
stats.exponential(rate)
stats.gamma(shape, scale)
stats.invgamma(shape, scale)
stats.kumaraswamy(alpha, beta)
stats.lognormal(mu, sigma)
stats.normal(mean, std)
stats.pareto(scale, shape)
stats.studentt(dof) 
stats.tukey(nmeans, dof)
stats.weibull(scale, shape)
stats.uniform(a,b)
stats.binomial
stats.negbin
stats.hypgeom
stats.poisson
stats.triangular
stats.arcsine(a,b)
```

* We use the [jStat](http://jstat.github.io/distributions.html) library for distributions. Other statistic functions are available though undocumented as the interface/names might change.

## Python Packages

We run Python3 in the browser through [Pyodide](https://github.com/iodide-project/pyodide) and [currently support all of the packages that Pyodide does](https://github.com/iodide-project/pyodide/tree/master/packages). These include:

| Package | Description |
| :--- | :--- |
| [NetworkX](https://networkx.github.io/) | Graphs and networks |
| [pandas](https://pandas.pydata.org/) | Data transformation and analysis |
| [scikit-learn](https://scikit-learn.org/stable/) | Machine Learning |
| [SciPy](https://www.scipy.org/) | Optimization, linear algebra, and statistics |
| [uncertainties](https://pythonhosted.org/uncertainties/index.html) | Numbers with uncertainties  |

