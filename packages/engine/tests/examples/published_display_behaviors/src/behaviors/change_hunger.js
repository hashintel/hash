function behavior(state, context) {
  if (state.hunger === 50) {
    state.grow = false;
  } else if (state.hunger === 0) {
    state.grow = true;
  }

  state.hunger += state.grow ? 0.5 : -0.5;
}
