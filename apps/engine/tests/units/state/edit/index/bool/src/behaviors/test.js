/**
 * Gets and sets a boolean value using index notation
 */
const behavior = (state, context) => {
  state["b1_is_boolean"] = typeof state["b1"] === "boolean";

  state["b2"] = state["b1"] && true;
  state["b1"] = false;

  state["b2_is_boolean"] = typeof state["b2"] === "boolean";
};
