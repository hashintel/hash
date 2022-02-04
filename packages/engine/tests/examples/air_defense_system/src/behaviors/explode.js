const behavior = (state, context) => {
  // Explode if bomb reaches the ground
  if (state.position[2] === 0) {
    state.scale = [1, 1, 1];
    state.shape = "sphere";
    state.scale = [2, 2, 2];
    state.color = "red";
  } else if (state.position[2] < 0) {
    state.hidden = true;
    state.addMessage("hash", "remove_agent");
  }
};
