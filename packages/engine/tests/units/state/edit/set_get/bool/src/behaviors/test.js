/**
 * Gets and sets a boolean value using set/get notation
 */
const behavior = (state, context) => {
  state.set("b1_is_boolean", typeof state.get("b1") === "boolean");

  const b1 = state.get("b1");

  state.set("b2", b1 && true);
  state.set("b1", false);

  state.set("b2_is_boolean", typeof state.get("b2") === "boolean");
};
