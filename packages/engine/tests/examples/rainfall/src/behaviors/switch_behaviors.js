/**
 * This behavior switches the agent from diffusing its height
 * to behaving as terrain.
 */
function behavior(state, context) {
  // Stop diffusion once a certain time is reached
  if (state.age === context.globals().diffusion_length) {
    state.true_height = state.height;

    // Switch to terrain behavior
    state.behaviors = ["terrain.js"];
  }
}
