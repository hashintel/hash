/**
 * Gets and sets a number value using set/get notation
 */
const behavior = (state, context) => {
  state.n1_type = typeof state.get("n1");

  const n1 = state.get("n1");

  state.set("n2", n1 + 2);
  state.set("n1", 2);

  state.n2_type = typeof state.get("n2");
};
