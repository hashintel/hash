const behavior = (state, context) => {
  for (let i = 0; i < state.velocity.length; i++) {
    state.position[i] += state.velocity[i];
  }
};
