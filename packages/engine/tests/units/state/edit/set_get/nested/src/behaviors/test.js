/**
 * Gets and sets nested values on an object using index notation
 */
const behavior = (state, context) => {
  let o1 = state.get("o1");

  state.set("o1_is_struct", typeof o1 === "object" && !Array.isArray(o1));

  // Boolean
  state.set("o1_b1_is_boolean", typeof o1["b1"] === "boolean");

  o1["b2"] = o1["b1"] && true;
  o1["b1"] = false;

  state["o1_b2_is_boolean"] = typeof o1["b2"] === "boolean";

  // number
  state["o1_n1_is_number"] = typeof o1["n1"] === "number";

  o1["n2"] = o1["n1"] + 2;
  o1["n1"] = 2;

  state["o1_n2_is_number"] = typeof o1["n2"] === "number";

  // string
  state["o1_s1_is_string"] = typeof o1["s1"] === "string";

  o1["s2"] = o1["s1"] + " hat";
  o1["s1"] = "beret";

  state["o1_s2_is_string"] = typeof o1["s2"] === "string";

  // object
  state["o1_o1_is_struct"] =
    typeof o1["o1"] === "object" && !Array.isArray(o1["o1"]);
  state["o1_o1_n1_is_number"] = typeof o1["o1"]["n1"] === "number";

  o1["o1"]["n2"] = o1["o1"]["n1"] + 1;
  o1["o1"]["n1"] = 3;

  state["o1_o1_n2_is_number"] = typeof o1["o1"]["n2"] === "number";

  // list
  state["o1_l1_is_list"] = Array.isArray(o1["l1"]);
  state["o1_l1_0_is_number"] = typeof o1["l1"][0] === "number";

  o1["l2"] = o1["l1"].concat(4);
  o1["l1"].unshift(0);

  state["o1_l2_is_list"] = Array.isArray(o1["l2"]);
  state["o1_l2_0_is_number"] = typeof o1["l2"][0] === "number";

  // fixed size list
  state["o1_f1_is_list"] = Array.isArray(o1["f1"]);
  state["o1_f1_0_is_number"] = typeof o1["f1"][0] === "number";

  o1["f2"] = [o1["f1"][0] * 5, o1["f1"][1] * 10];
  o1["f1"][0] *= 10;
  o1["f1"][1] *= 20;

  state["o1_f2_is_list"] = Array.isArray(o1["f2"]);
  state["o1_f2_0_is_number"] = typeof o1["f2"][0] === "number";

  state.set("o1", o1);
};
