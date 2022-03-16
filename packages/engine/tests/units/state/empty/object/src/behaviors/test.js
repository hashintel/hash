/**
 * Verifies the type of the object
 */
const behavior = (state, context) => {
  state.o1_is_struct = typeof state.o1 === "object" && !Array.isArray(state.o1);
};
