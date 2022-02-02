const behavior = (state, context) => {
  const { assetBurnTime } = context.globals();
  function same_position(npos) {
    const dx = Math.abs(npos[0] - state.position[0]);
    const dy = Math.abs(npos[1] - state.position[1]);

    if (dx < 1 && dy < 1 && npos[2] === 0) {
      return true;
    }
    return false;
  }

  // Assets have a very small chance of regenerating
  if (state.status === "destroyed" && Math.random() < 1 / 1000) {
    state.status = "normal";
    state.color = "limegreen";
    state.height = 1;
    state.alive = true;
  }

  // Asset burning after struck by bomb
  if (state.burnTimeout) {
    state.burnTimeout--;
    if (state.burnTimeout === 0) {
      state.status = "destroyed";
      state.color = "saddlebrown";
      state.height = 0;
      state.burnTimeout = null;
    }
  }

  // Determine if struck by bomb
  const bomb = context
    .neighbors()
    .filter((n) => n.type === "bomb" && same_position(n.position));
  if (bomb.length && state.status === "normal") {
    state.alive = false;
    state.color = "orangered";
    state.status = "burning";
    state.burnTimeout = assetBurnTime;
  }
};
