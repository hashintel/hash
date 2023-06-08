function behavior(state, context) {
  // Unpack needed properties
  const { field, discrete_shapes, field_values } = state.shape_discrete;
  const value = state[field];

  // Determine shapes based on value
  let new_shape = discrete_shapes[0];

  field_values.forEach((val, ind) => {
    if (value === val) {
      new_shape = discrete_shapes[ind];
    } else if (value > val) {
      new_shape = discrete_shapes[ind];
    }
  });

  state.shape = new_shape;
}
