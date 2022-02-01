/** This behavior keeps the angle between PI and - PI. */
function behavior(state, context) {
  // Correct wrapping of angle
  if (state.angle > Math.PI) {
    state.angle -= 2 * Math.PI;
  } else if (state.angle < -Math.PI) {
    state.angle += 2 * Math.PI;
  }
}
