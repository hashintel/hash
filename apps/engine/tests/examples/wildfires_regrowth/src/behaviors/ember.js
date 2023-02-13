/**
 * This behavior causes the agent to change from an ember
 * back to a growing tree.
 */
function behavior(state, context) {
  const { emberColor, emberHeight, regrowthChance } = context.globals();

  // Get neighbors that are "trees"
  const forestNeighbors = context
    .neighbors()
    .filter(({ behaviors }) => behaviors.includes("forest.js"));

  // Turn back into a tree, with a linear increase
  // in likelihood with # of neighbors
  const modRegrowthChance = regrowthChance * (forestNeighbors.length + 1);
  if (modRegrowthChance > Math.random()) {
    // Replace the ember behavior with forest behavior
    state.behaviors[state.behaviorIndex()] = "forest.js";
  }

  // Set other needed properties for an "ember"
  state.color = emberColor;
  state.height = emberHeight;
  state.age = 0;
}
