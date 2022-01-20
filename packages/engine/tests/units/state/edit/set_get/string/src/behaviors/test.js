/**
 * Gets and sets a string value using set/get notation
 */
const behavior = (state, context) => {
  state.s1_type = typeof state.get("s1");

  state.set("s2", state.get("s1") + " hat");
  state.set("s1", "beret");

  state.s2_type = typeof state.get("s2");
};
