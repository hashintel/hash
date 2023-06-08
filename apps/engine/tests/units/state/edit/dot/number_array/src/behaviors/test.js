/**
 * Gets and sets a number array using dot notation
 */
const behavior = (state, context) => {
  state.n1_is_list = Array.isArray(state.n1);
  state.n1_0_is_number = typeof state.n1[0] === "number";

  state.n2 = state.n1.concat(4);
  state.n1.unshift(0);

  state.n2_is_list = Array.isArray(state.n2);
  state.n2_0_is_number = typeof state.n2[0] === "number";
};
