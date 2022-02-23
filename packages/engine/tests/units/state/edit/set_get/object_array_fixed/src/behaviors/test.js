/**
 * Gets and sets a struct fixed-size-array using set/get notation
 */
const behavior = (state, context) => {
  state.set("o1_is_list", Array.isArray(state.get("o1")));
  state.set(
    "o1_0_is_struct",
    typeof state.get("o1")[0] === "object" &&
      !Array.isArray(state.get("o1")[0]),
  );
  state.set("o1_0_n1_is_number", typeof state.get("o1")[0].n1 === "number");
  state.set("o1_1_n1_is_number", typeof state.get("o1")[1].n1 === "number");

  o1_0 = { n1: state.get("o1")[0].n1 * 10, n2: state.get("o1")[0].n1 * 5 };
  o1_1 = { n1: state.get("o1")[1].n1 * 20, n2: state.get("o1")[1].n1 * 10 };
  state.set("o1", [o1_0, o1_1]);

  state.set("o1_0_n2_is_number", typeof state.get("o1")[0].n2 === "number");
  state.set(
    "o1_1_is_struct",
    typeof state.get("o1")[1] === "object" &&
      !Array.isArray(state.get("o1")[1]),
  );
  state.set("o1_1_n2_is_number", typeof state.get("o1")[1].n2 === "number");
};
