/**
 * Gets and sets a number array using set/get notation
 */
const behavior = (state, context) => {
  state.set("n1_is_list", Array.isArray(state.get("n1")));
  state.set("n1_0_is_number", typeof state.get("n1")[0] === "number");

  const n1 = state.get("n1");

  state.set("n2", n1.concat(4));
  const unshifted_n1 = n1.unshift(0);

  state.set("n1", n1);

  state.set("n2_is_list", Array.isArray(state.get("n2")));
  state.set("n2_0_is_number", typeof state.get("n2")[0] === "number");
};
