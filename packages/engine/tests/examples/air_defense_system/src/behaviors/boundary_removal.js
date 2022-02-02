const behavior = (state, context) => {
  const { topology } = context.globals();

  /**
   * ---- Remove From Environment ----
   * Remove aircraft if boundary edge is reached or
   * if shot down and z position is <= 0
   */
  if (
    state.position[0] + 1 >= topology.x_bounds[1] ||
    state.position[1] + 1 >= topology.y_bounds[1] ||
    state.position[2] <= 0
  ) {
    state.addMessage("hash", "remove_agent");
  }
};
