/**
 * This behavior sets the height of the agent and causes it to
 * stop trying to move when it has reached a local minimum.
 */
function behavior(state, context) {
  // Determine the height of the terrain underneath, and set as raindrop height
  const currentPatch = context
    .neighbors()
    .filter(
      ({ position, behaviors }) =>
        position.toString() === state.position.toString() &&
        behaviors.includes("terrain.js"),
    )[0];

  state.height = currentPatch.height;

  if (state.direction !== null) {
    // Check if a raindrop is no longer moving
    const is_all_zero = state.direction.every((item) => item === 0);
    if (is_all_zero) {
      state.modify("still_time", (t) => t + 1);

      // If a raindrop won't move anymore, remove extraneous behaviors
      if (state.still_time >= 2) {
        state.behaviors = [];
        state.still = true;
      }
    }
  }
}
