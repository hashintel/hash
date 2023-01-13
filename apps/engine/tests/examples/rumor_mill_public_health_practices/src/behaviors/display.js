/**
 * This behavior sets the color and height of the agent
 * based on the hygiene and government trust levels.
 */
function behavior(state, context) {
  // color based on distrust
  if (state.gov_trust < 0.25) {
    state.color = "red";
  } else if (state.gov_trust < 0.5) {
    state.color = "orange";
  } else if (state.gov_trust >= 0.75) {
    state.color = "green";
  } else {
    state.color = "blue";
  }

  // height based on hygiene
  state.height = 10 * state.hygiene;
}
