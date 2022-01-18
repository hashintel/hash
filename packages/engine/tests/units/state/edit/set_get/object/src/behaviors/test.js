/**
 * Gets and sets an object value using set/get notation
 */
const behavior = (state, context) => {
  state.o1_type = typeof state.get("o1");
  state.o1_n1_type = typeof state.get("o1").n1;

  const o1 = state.get("o1");

  o1.n2 = o1.n1 + 1;
  o1.n1 = 3;

  state.set("o1", o1);

  state.o1_n2_type = typeof state.get("o1").n2;
};
