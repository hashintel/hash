/**
 * This behavior causes the tree agent to "catch fire",
 * turn red, and then "burn down" into an ember.
 */
function behavior(state, context) {
  // Replace the fire behavior with the ember behavior
  state.behaviors[state.behaviorIndex()] = "ember.js";

  state.color = context.globals().fireColor;
  state.shape = "fire";
  state.height = 3;
}
