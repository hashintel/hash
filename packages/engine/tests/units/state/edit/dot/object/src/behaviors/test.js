/**
 * Gets and sets an object value using dot notation
 */
const behavior = (state, context) => {
  state.o1_type = typeof state.o1;
  state.o1_n1_type = typeof state.o1.n1;

  state.o1.n2 = state.o1.n1 + 1;
  state.o1.n1 = 3;

  state.o1_n2_type = typeof state.o1.n2;
};
