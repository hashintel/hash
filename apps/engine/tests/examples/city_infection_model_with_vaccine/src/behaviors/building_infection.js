/**
 * This behavior updates a building's propoerties
 * based on the number of infected occupants.
 */
function behavior(state, context) {
  const { building_colors } = context.globals();
  const neighbors = context.neighbors();
  state.set("occupancy", neighbors.length);

  let color;
  let height;

  // Choose display properties based on infected occupants
  let infected = neighbors.filter((e) => e.health_status == "infected");
  if (infected.length > 0) {
    color = "red";
    height = infected.length * 4;
  } else {
    color = building_colors[state.get("template_name")];
    height = 2;
  }

  state.set("color", color);
  state.set("height", height);
}
