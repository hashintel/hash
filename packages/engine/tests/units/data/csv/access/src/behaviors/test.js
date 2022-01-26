/**
 * Reads content from a dataset
 */
const behavior = (state, context) => {
  const data = context.data()["dataset.csv"];

  state.column_1 = data[0];
  state.column_2 = data[1];
  state.column_3 = data[2];
};
