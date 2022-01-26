/**
 * Gets and sets a string value using set/get notation
 */
const behavior = (state, context) => {
  state.set("s1_is_string", typeof state.get("s1") === "string");

  const s1 = state.get("s1");

  state.set("s2", s1 + " hat");
  state.set("s1", "beret");

  state.set("s2_is_string", typeof state.get("s2") === "string");
};
