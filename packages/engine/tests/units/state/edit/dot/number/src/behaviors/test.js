/**
 * Gets and sets a number value using dot notation
 */
const behavior = (state, context) => {
  state.n1_type = typeof state.n1;

  state.n2 = state.n1 + 2;
  state.n1 = 2;

  state.n2_type = typeof state.n2;
};
