/**
 * Gets and sets a boolean fixed-size-array using set/get notation
 */
const behavior = (state, context) => {
  state.set("b1_is_list", Array.isArray(state.get("b1")));
  state.set("b1_0_is_boolean", typeof state.get("b1")[0] === "boolean");

  state.set("b2", [!state.get("b1")[0], !state.get("b1")[1]]);

  state.set("b2_is_list", Array.isArray(state.get("b2")));
  state.set("b2_0_is_boolean", typeof state.get("b2")[0] === "boolean");
};
