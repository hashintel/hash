/**
 * Reads content from a dataset
 */
const behavior = (state, context) => {
  const data = context.data()["dataset.json"];

  state.number = data.number;
  state.string = data.string;
  state.bool = data.bool;
  state.struct = data.struct;
  state.number_array = data.number_array;
  state.bool_array = data.bool_array;
  state.struct_array = data.struct_array;
};
