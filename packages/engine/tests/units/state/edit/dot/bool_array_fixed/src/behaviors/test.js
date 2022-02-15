/**
 * Gets and sets a boolean fixed-size-array using dot notation
 */
const behavior = (state, context) => {
  state.b1_is_list = Array.isArray(state.b1);
  state.b1_0_is_boolean = typeof state.b1[0] === "boolean";

  state.b2 = [!state.b1[0], !state.b1[1]];

  state.b2_is_list = Array.isArray(state.b2);
  state.b2_0_is_boolean = typeof state.b2[0] === "boolean";
};
