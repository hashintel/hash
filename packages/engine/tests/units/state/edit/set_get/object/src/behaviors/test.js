/**
 * Gets and sets an object value using set/get notation
 */
const behavior = (state, context) => {
  state.set(
    "o1_is_struct",
    typeof state.get("o1") === "object" && !Array.isArray(state.get("o1")),
  );
  state.set("o1_n1_is_number", typeof state.get("o1").n1 === "number");

  const o1 = state.get("o1");

  o1.n2 = o1.n1 + 1;
  o1.n1 = 3;

  state.set("o1", o1);

  state.set("o1_n2_is_number", typeof state.get("o1").n2 === "number");
};
