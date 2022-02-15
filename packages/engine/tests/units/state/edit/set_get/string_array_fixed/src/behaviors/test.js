/**
 * Gets and sets a string fixed-size-array using set/get notation
 */
const behavior = (state, context) => {
  state.set("s1_is_list", Array.isArray(state.get("s1")));
  state.set("s1_0_is_string", typeof state.get("s1")[0] === "string");
  state.set("s1_1_is_string", typeof state.get("s1")[1] === "string");

  state.set("s2", [state.get("s1")[0] + "bar", state.get("s1")[1] + "foo"]);
  state.set("s1", [state.get("s1")[0] + "boo", state.get("s1")[1] + "far"]);

  state.set("s2_is_list", Array.isArray(state.get("s2")));
  state.set("s2_0_is_string", typeof state.get("s2")[0] === "string");
  state.set("s2_1_is_string", typeof state.get("s2")[1] === "string");
};
