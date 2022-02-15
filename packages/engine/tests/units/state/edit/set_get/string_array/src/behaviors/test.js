/**
 * Gets and sets a string array using set/get notation
 */
const behavior = (state, context) => {
  state.set("s1_is_list", Array.isArray(state.get("s1")));
  state.set("s1_0_is_string", typeof state.get("s1")[0] === "string");

  const s1 = state.get("s1");

  state.set("s2", s1.concat("buzz"));
  const unshifted_s1 = s1.unshift("bazz");

  state.set("s1", s1);

  state.set("s2_is_list", Array.isArray(state.get("s2")));
  state.set("s2_0_is_string", typeof state.get("s2")[0] === "string");
};
