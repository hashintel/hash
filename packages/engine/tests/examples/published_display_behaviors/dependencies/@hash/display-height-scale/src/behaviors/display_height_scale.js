function behavior(state, context) {
  // Unpack needed properties
  const { field, scale, field_bounds, bounds } = state.height_scaling;
  const [value_min, value_max] = field_bounds;

  // Keep field value within bounds
  let value = state[field];
  value = hash_stdlib.stats.min([value, value_max]);
  value = hash_stdlib.stats.max([value, value_min]);

  const value_pct = (value - value_min) / (value_max - value_min);

  // Get the max, min height
  const [height_min, height_max] = bounds;
  const range = height_max - height_min;

  // Choose scale (linear or log)
  const scale_func = {
    linear: (range, val) => val * range,
    log: (range, val) => Math.log10(9 * val + 1) * range,
  };

  // Calculate the height
  state.height = scale_func[scale](range, value_pct) + height_min;
}
