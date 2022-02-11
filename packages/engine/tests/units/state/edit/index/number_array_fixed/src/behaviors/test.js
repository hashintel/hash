/**
 * Gets and sets a number fixed-size-array using index notation
 */
const behavior = (state, context) => {
  state["n1_is_list"] = typeof state["n1"] === "object";
  state["n1_0_is_number"] = typeof state["n1"][0] === "number";

  state["n2"] = [state["n1"][0] * 5, state["n1"][1] * 10];
  state["n1"][0] *= 10;
  state["n1"][1] *= 20;

  state["n2_is_list"] = typeof state["n2"] === "object";
  state["n2_0_is_number"] = typeof state["n2"][0] === "number";
};
