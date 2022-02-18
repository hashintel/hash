This simulation implements Epstein and Axtell’s Sugarscape model.

Each ‘sugar’ cell is fixed and has a predetermined amount of sugar that is mapped to a specific height and color. These sugar values are then diffused for a certain number of steps to make traversal of the cells easier for the agents.

Agents start randomly on the grid of ‘sugar’ cells and roam the grid, accumulating sugar. At each step, agents look at their neighbors and moves to the cell with the greatest amount of sugar.

## Optimization

The Gini coefficient is a measure of the inequality in a population. In this simulation, this would represent how unequal the distribution of sugar is among all the agents. One way we might try to reduce this inequality is by making the initial wealth of agents more equal. The "Minimize the Gini Coefficient" experiment finds the optimal value for `initial_sugar.max` by minimizing the `gini_coefficient` metric.

Run it and see if we the experiment produces any interesting conclusions.

```video
https://cdn-us1.hash.ai/site/Sugarscape.mp4
```
