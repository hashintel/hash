/**
 * Ensures a dataset is immutable
 */
const behavior = (state, context) => {
  context.data()["dataset.csv"][0][0] = "4";
  state.column = context.data()["dataset.csv"][0];
};
