This model simulates the spread of wildfires in a regrowing forest.

All trees grow over time, and have a small chance of being struck by lightning. If a tree is struck by lightning, or is adjacent to a fire, it sets alight. After burning for one step, the tree is reduced to an 'ember'.

Embers have a small chance of regrowing into a new tree each step, and that chance increases linearly with the count of its adjacent trees.

# Analysis

In this model, we can play with the effects of changing forest density, regrowth rate, and lighting probability in order to observe the health of our 'regrowing' forest.

Consider what metrics we might evaluate to determine the health of our forest:
Average tree height and the number of trees in our forest exhibit periodic fluctuations. We could assess the frequency of these fluctuations or their amplitude.

If we define a "wildfire" as a step in the model during which there are more than a certain critical percentage of trees on fire, we can assess the frequency with which they occur. Is it periodic, or does the time between them increase?

## Optimization

Let's find out what the optimal parameters are for our forest. We'll define the healthiest forest as the one with the most trees and/or trees living the longest. We can use the `sum_age` metric as a proxy for this, since it will capture both forests with lots of trees, and forests with very old trees.

If we use `sum_age` in an Opimization experiment, we might have an experiment that looks like **Optimal Rates for Forest Growth**. This optimization varies the `lightningChance` and `regrowthChance` globals to find optimal values for both of those. If we run the experiment, our result will show that we want to minimize both values.

Reducing the number of lightning strikes is a fairly intuitive way to increase the health of our forest, but why should we be minimizing the chance of regrowth? Well, if you observe the **Agents by behaviors** plot, you'll see that our optimal case produces very little of the wild oscillation that is found in the base set of parameters for the model. When trees become overcrowded, fires are much easier to spread, causing much more devastation, leading to the oscillating behavior. Reducing the regrowth ensures that trees lead long and healthy lives.

See also the unbounded [Forest](https://hash.ai/index/5e065650196c3fbd41d8bd43/forest) model.

```video
https://cdn-us1.hash.ai/site/forest-regrowth-poly.mp4
```
