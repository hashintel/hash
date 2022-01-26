/**
 * Gets and sets a number value using set/get notation
 */
const behavior = (state, context) => {
  state.set("n1_is_number", typeof state.get("n1") === "number");

  const n1 = state.get("n1");

  state.set("n2", n1 + 2);
  state.set("n1", 2);

  state.set("n2_is_number", typeof state.get("n2") === "number");
};
