function behavior(state, context) {
  const { field, discrete_colors, field_values } = state.color_discrete;

  const value = state[field];

  let new_color = discrete_colors[0];

  field_values.forEach((val, ind) => {
    if (value >= val) {
      new_color = discrete_colors[ind];
    }
  });

  state.color = new_color;
}
