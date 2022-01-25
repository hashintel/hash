/**
 * Gets and sets a string value using index notation
 */
const behavior = (state, context) => {
  state["s1_is_string"] = typeof state["s1"] === "string";

  state["s2"] = state["s1"] + " hat";
  state["s1"] = "beret";

  state["s2_is_string"] = typeof state["s2"] === "string";
};
