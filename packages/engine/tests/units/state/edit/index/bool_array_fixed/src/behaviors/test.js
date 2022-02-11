/**
 * Gets and sets a boolean fixed-size-array using index notation
 */
const behavior = (state, context) => {
  state["b1_is_list"] = typeof state["b1"] === "object";
  state["b1_0_is_boolean"] = typeof state["b1"][0] === "boolean";

  state["b2"] = [!state["b1"][0], !state["b1"][1]];

  state["b2_is_list"] = typeof state["b2"] === "object";
  state["b2_0_is_boolean"] = typeof state["b2"][0] === "boolean";
};
