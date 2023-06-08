const behavior = (state, context) => {
  const u_stats = state.utilization_stats;

  /**
   * --- Update Utilization Stats ---
   */
  u_stats.movement_percentage = u_stats.movement_time / state.timestep;
  u_stats.idle_percentage = u_stats.idle_time / state.timestep;

  state.timestep += 1;
  state.utilization_stats = u_stats;
};
