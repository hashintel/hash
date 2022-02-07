/**
 * This behavior causes a tree to catch fire from its
 * neighbors or from a random lightning strike.
 */
function behavior(state, context) {
  const { lightningChance, lightningColor, forestColor, forestHeight } =
    context.globals();

  // Grow the trees' height logarithmically with age
  state.height = Math.max(2, 2 + Math.log2((forestHeight * state.age) / 10));

  // Get neighbors that are on fire
  const fireNeighbors = context
    .neighbors()
    .filter(({ behaviors }) => behaviors.includes("fire.js")).length;

  // Tres can be struck by lightning randomly
  const struckByLightning = lightningChance > Math.random();

  // If there is an adjacent fire or lightning strike
  // then this tree starts to burn (becomes fire)
  if (struckByLightning || fireNeighbors > 0) {
    // Replace forest behavior with fire
    state.behaviors[state.behaviorIndex()] = "fire.js";
  }

  // Color the agent appropriately
  if (struckByLightning) {
    state.color = lightningColor;
  } else {
    state.color = forestColor;
    state.shape = "xmas-tree";
  }
}
