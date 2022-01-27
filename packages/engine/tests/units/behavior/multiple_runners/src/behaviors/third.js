/**
 * Reads value written in second behavior and stores a modified value of it to ensure behavior composability
 */
const behavior = (state, context) => {
  state.c = state.b + 1;
};
