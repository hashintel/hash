/**
 * Reads the value written by the second behavior and stores a modified value of it in a new field to ensure behavior composability
 */
const behavior = (state, context) => {
  state.c = state.b + 1;
};
