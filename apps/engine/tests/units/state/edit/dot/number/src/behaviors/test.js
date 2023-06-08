/**
 * Gets and sets a number value using dot notation
 */
const behavior = (state, context) => {
  state.n1_is_number = typeof state.n1 === "number";

  state.n2 = state.n1 + 2;
  state.n1 = 2;

  state.n2_is_number = typeof state.n2 === "number";
};
