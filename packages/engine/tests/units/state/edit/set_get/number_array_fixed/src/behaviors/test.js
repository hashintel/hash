/**
 * Gets and sets a number fixed-size-array using set/get notation
 */
const behavior = (state, context) => {
  state.set("n1_is_list", Array.isArray(state.get("n1")));
  state.set("n1_0_is_number", typeof state.get("n1")[0] === "number");

  state.set("n2", [state.get("n1")[0] * 5, state.get("n1")[1] * 10]);
  state.set("n1", [state.get("n1")[0] * 10, state.get("n1")[1] * 20]);

  state.set("n2_is_list", Array.isArray(state.get("n2")));
  state.set("n2_0_is_number", typeof state.get("n2")[0] === "number");
};
