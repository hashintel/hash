/**
 * Gets and sets an object value using index notation
 */
const behavior = (state, context) => {
  state["o1_is_struct"] =
    typeof state["o1"] === "object" && !Array.isArray(state["o1"]);
  state["o1_n1_is_number"] = typeof state["o1"]["n1"] === "number";

  state["o1"]["n2"] = state["o1"]["n1"] + 1;
  state["o1"]["n1"] = 3;

  state["o1_n2_is_number"] = typeof state["o1"]["n2"] === "number";
};
