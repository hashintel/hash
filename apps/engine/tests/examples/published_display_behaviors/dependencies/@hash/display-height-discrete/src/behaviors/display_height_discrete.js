function behavior(state, context) {
  // Unpack needed properties
  const { field, discrete_heights, field_values } = state.height_discrete;
  const value = state[field];

  // Determine height based on value
  let new_height = discrete_heights[0];

  field_values.forEach((val, ind) => {
    if (value === val) {
      new_height = discrete_heights[ind];
    } else if (value > val) {
      new_height = discrete_heights[ind];
    }
  });

  state.height = new_height;
}
