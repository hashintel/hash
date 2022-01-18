/**
 * Gets and sets a number array using set/get notation
 */
const behavior = (state, context) => {
  state.n1_0_type = typeof state.get("n1")[0];

  const n1 = state.get("n1");

  state.set("n2", n1.concat(4));
  const unshifted_n1 = n1.unshift(false);

  state.set("n1", n1);

  state.n2_0_type = typeof state.get("n2")[0];
};
