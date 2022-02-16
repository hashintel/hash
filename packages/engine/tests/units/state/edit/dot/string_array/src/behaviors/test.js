/**
 * Gets and sets a string array using dot notation
 */
const behavior = (state, context) => {
  state.s1_is_list = Array.isArray(state.s1);
  state.s1_0_is_string = typeof state.s1[0] === "string";

  state.s2 = state.s1.concat("buzz");
  state.s1.unshift("bazz");

  state.s2_is_list = Array.isArray(state.s2);
  state.s2_0_is_string = typeof state.s2[0] === "string";
};
