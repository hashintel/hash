/**
 * Gets and sets a string value using dot notation
 */
const behavior = (state, context) => {
  state.s1_type = typeof state.s1;

  state.s2 = state.s1 + " hat";
  state.s1 = "beret";

  state.s2_type = typeof state.s2;
};
