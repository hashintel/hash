function behavior(state, context) {
  // Unpack needed properties
  const { field, scale, field_bounds, bounds } = state.scale_scaling;
  const [value_min, value_max] = field_bounds;

  // Keep field value within bounds
  let value = state[field];
  value = hash_stdlib.stats.min([value, value_max]);
  value = hash_stdlib.stats.max([value, value_min]);

  const value_proportion = (value - value_min) / (value_max - value_min);

  // Get the max, min scale
  const [scale_mins, scale_maxs] = bounds;
  const scale_ranges = Array(3)
    .fill()
    .map((_, ind) => scale_maxs[ind] - scale_mins[ind]);

  // Calculate scale (linear or log)
  const scale_func = {
    linear: (range, val) => val * range,
    log: (range, val) => Math.log10(9 * val + 1) * range,
  };

  state.scale = scale_ranges.map(
    (range, ind) =>
      scale_func[scale](range, value_proportion) + scale_mins[ind],
  );
}
