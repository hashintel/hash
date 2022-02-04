function behavior(state, context) {
  // Get the rgb field value, max, and min
  const { field, scale, field_bounds, bounds } = state.rgb_scaling;
  const [value_min, value_max] = field_bounds;

  // Keep field value within bounds
  let value = state[field];
  value = hash_stdlib.stats.min([value, value_max]);
  value = hash_stdlib.stats.max([value, value_min]);

  const value_proportion = (value - value_min) / (value_max - value_min);

  // Get the max, min rgb
  const [rgb_mins, rgb_maxs] = bounds;
  const rgb_ranges = Array(3)
    .fill()
    .map((_, ind) => rgb_maxs[ind] - rgb_mins[ind]);

  // Choose scale (linear or log)
  const scale_func = {
    linear: (range, val) => val * range,
    log: (range, val) => Math.log10(9 * val + 1) * range,
  };

  // Calculate rgb
  state.rgb = rgb_ranges.map((range, ind) =>
    Math.floor(scale_func[scale](range, value_proportion) + rgb_mins[ind]),
  );
}
