const behavior = (state, context) => {
  state.answer_calls = !state.answer_calls;

  let util_stats = state.utilization_stats;

  util_stats.operators_percentage =
    state.current_calls.length / state.operators;
  util_stats.avg_wait_time = util_stats.total_wait_time / util_stats.timestep;
  util_stats.timestep++;

  state.utilization_stats = util_stats;

  state.counter++;
  if (state.counter === 4) {
    state.counter = 0;
  }
};
