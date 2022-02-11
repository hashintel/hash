/**
 * Gets and sets a string fixed-size-array using dot notation
 */
const behavior = (state, context) => {
  state.s1_is_list = typeof state.s1 === "object";
  state.s1_0_is_string = typeof state.s1[0] === "string";
  state.s1_1_is_string = typeof state.s1[1] === "string";

  state.s2 = [state.s1[0] + "bar", state.s1[1] + "foo"];
  state.s1[0] += "boo";
  state.s1[1] += "far";

  state.s2_is_list = typeof state.s2 === "object";
  state.s2_0_is_string = typeof state.s2[0] === "string";
  state.s2_1_is_string = typeof state.s2[1] === "string";
};
