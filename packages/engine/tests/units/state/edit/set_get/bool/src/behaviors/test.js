/**
 * Gets and sets a boolean value using set/get notation
 */
const behavior = (state, context) => {
  state.b1_type = typeof state.get("b1");

  const b1 = state.get("b1");

  state.set("b2", b1 && true);
  state.set("b1", false);

  state.b2_type = typeof state.get("b2");
};
