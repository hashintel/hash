/**
 * Gets and sets an object array using dot notation
 */
const behavior = (state, context) => {
  state.o1_type = typeof state.o1;
  state.o1_0_type = typeof state.o1[0];
  state.o1_0_n1_type = typeof state.o1[0].n1;

  state.o1[0].n2 = state.o1[0].n1 + 1;
  state.o1.push({ n3: 3 });

  state.o1_0_n2_type = typeof state.o1[0].n2;
  state.o1_1_n3_type = typeof state.o1[1].n3;
};
