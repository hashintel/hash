/**
 * Increments the position per step for checking different wrapping behaviors
 */
const behavior = (state, context) => {
  state.position[0] += 1;
  state.position[1] += 1;
};
