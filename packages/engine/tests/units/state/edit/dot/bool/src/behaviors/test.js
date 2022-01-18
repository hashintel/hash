/**
 * Gets and sets a boolean value using dot notation
 */
const behavior = (state, context) => {
  state.b1_type = typeof state.b1;

  state.b2 = state.b1 && true;
  state.b1 = false;

  state.b2_type = typeof state.b2;
};
