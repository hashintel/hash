/**
 * Gets and sets a boolean array using dot notation
 */
const behavior = (state, context) => {
  state.b1_0_type = typeof state.b1[0];

  state.b2 = state.b1.concat(true);
  state.b1.unshift(false);

  state.b2_0_type = typeof state.b2[0];
};
