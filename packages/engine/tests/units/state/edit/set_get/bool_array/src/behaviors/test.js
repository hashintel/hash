/**
 * Gets and sets a boolean array using set/get notation
 */
const behavior = (state, context) => {
  state.b1_0_type = typeof state.get("b1")[0];

  const b1 = state.get("b1");

  state.set("b2", b1.concat(true));
  const unshifted_b1 = b1.unshift(false);

  state.set("b1", b1);

  state.b2_0_type = typeof state.get("b2")[0];
};
