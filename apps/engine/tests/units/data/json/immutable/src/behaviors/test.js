/**
 * Ensures a dataset is immutable
 */
const behavior = (state, context) => {
  context.data()["dataset.json"].number = 2;
  state.number = context.data()["dataset.json"].number;
};
