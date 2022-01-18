/**
 * Gets and sets a number array using dot notation
 */
const behavior = (state, context) => {
  state.n1_0_type = typeof state.n1[0];

  state.n2 = state.n1.concat(4);
  state.n1.unshift(0);

  state.n2_0_type = typeof state.n2[0];
};
