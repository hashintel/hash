/**
 * Gets and sets an object array using set/get notation
 */
const behavior = (state, context) => {
  state.o1_type = typeof state.get("o1");
  state.o1_0_type = typeof state.get("o1")[0];
  state.o1_0_n1_type = typeof state.get("o1")[0].n1;

  const o1 = state.get("o1");

  o1[0].n2 = o1[0].n1 + 1;
  o1.push({ n3: 3 });

  state.set("o1", o1);

  state.o1_0_n2_type = typeof state.get("o1")[0].n2;
  state.o1_1_n3_type = typeof state.get("o1")[1].n3;
};
