/**
 * This behavior updates a building's propoerties
 * based on the number of infected occupants.
 */
function behavior(state, context) {
  const { building_colors } = context.globals();
  const neighbors = context.neighbors();
  state.occupancy = neighbors.length;

  // Choose display properties based on infected occupants
  let infected = neighbors.filter((e) => e.health_status == "infected");
  if (infected.length > 0) {
    state.color = "red";
    // state.height = infected.length*4;
  } else {
    state.color = building_colors[state.template_name];
    // state.height = 2
  }
}
