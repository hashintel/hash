/**
 * Gets and sets a boolean array using set/get notation
 */
const behavior = (state, context) => {
  state.set("b1_is_list", Array.isArray(state.get("b1")));
  state.set("b1_0_is_boolean", typeof state.get("b1")[0] === "boolean");

  const b1 = state.get("b1");

  state.set("b2", b1.concat(true));
  const unshifted_b1 = b1.unshift(false);

  state.set("b1", b1);

  state.set("b2_is_list", Array.isArray(state.get("b2")));
  state.set("b2_0_is_boolean", typeof state.get("b2")[0] === "boolean");
};
