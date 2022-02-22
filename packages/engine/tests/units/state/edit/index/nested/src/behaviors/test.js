/**
 * Gets and sets nested values on an object using index notation
 */
const behavior = (state, context) => {
  state["o1_is_struct"] =
    typeof state["o1"] === "object" && !Array.isArray(state["o1"]);

  // Boolean
  state["o1_b1_is_boolean"] = typeof state["o1"]["b1"] === "boolean";

  state["o1"]["b2"] = state["o1"]["b1"] && true;
  state["o1"]["b1"] = false;

  state["o1_b2_is_boolean"] = typeof state["o1"]["b2"] === "boolean";

  // number
  state["o1_n1_is_number"] = typeof state["o1"]["n1"] === "number";

  state["o1"]["n2"] = state["o1"]["n1"] + 2;
  state["o1"]["n1"] = 2;

  state["o1_n2_is_number"] = typeof state["o1"]["n2"] === "number";

  // string
  state["o1_s1_is_string"] = typeof state["o1"]["s1"] === "string";

  state["o1"]["s2"] = state["o1"]["s1"] + " hat";
  state["o1"]["s1"] = "beret";

  state["o1_s2_is_string"] = typeof state["o1"]["s2"] === "string";

  // object
  state["o1_o1_is_struct"] =
    typeof state["o1"]["o1"] === "object" && !Array.isArray(state["o1"]["o1"]);
  state["o1_o1_n1_is_number"] = typeof state["o1"]["o1"]["n1"] === "number";

  state["o1"]["o1"]["n2"] = state["o1"]["o1"]["n1"] + 1;
  state["o1"]["o1"]["n1"] = 3;

  state["o1_o1_n2_is_number"] = typeof state["o1"]["o1"]["n2"] === "number";

  // list
  state["o1_l1_is_list"] = Array.isArray(state["o1"]["l1"]);
  state["o1_l1_0_is_number"] = typeof state["o1"]["l1"][0] === "number";

  state["o1"]["l2"] = state["o1"]["l1"].concat(4);
  state["o1"]["l1"].unshift(0);

  state["o1_l2_is_list"] = Array.isArray(state["o1"]["l2"]);
  state["o1_l2_0_is_number"] = typeof state["o1"]["l2"][0] === "number";

  // fixed size list
  state["o1_f1_is_list"] = Array.isArray(state["o1"]["f1"]);
  state["o1_f1_0_is_number"] = typeof state["o1"]["f1"][0] === "number";

  state["o1"]["f2"] = [state["o1"]["f1"][0] * 5, state["o1"]["f1"][1] * 10];
  state["o1"]["f1"][0] *= 10;
  state["o1"]["f1"][1] *= 20;

  state["o1_f2_is_list"] = Array.isArray(state["o1"]["f2"]);
  state["o1_f2_0_is_number"] = typeof state["o1"]["f2"][0] === "number";
};
