/**
 * This behavior causes an ant agent to look for strong pheromones
 * within its search angle, and to move randomly otherwise.
 */
function behavior(state, context) {
  const { search_angle } = context.globals();

  // Check for strong pheromones in front
  const pheromones = context
    .neighbors()
    .filter((n) => n.behaviors.includes("pheromone_field.js"))
    .filter((p) => p.strength > 0)
    .filter((p) => {
      // ensure its visible within search angle
      const diffX = p.position[0] - state.position[0];
      const diffY = p.position[1] - state.position[1];
      let pheromone_angle = Math.atan2(diffY, diffX);

      return (
        pheromone_angle < state.angle + search_angle / 2 &&
        pheromone_angle > state.angle - search_angle / 2
      );
    });

  if (pheromones.length) {
    // Find the strongest visible pheromone
    const strongest = pheromones.reduce(
      (max, curr) => (curr.strength > max.strength ? curr : max),
      { strength: 0 },
    );
    // Orient towards it
    const diffX = strongest.position[0] - state.position[0];
    const diffY = strongest.position[1] - state.position[1];
    state.angle = Math.atan2(diffY, diffX);

    state.color = "blue";
  } else {
    // If not,  orient randomly within search angle
    const angleChange = Math.random() * search_angle - search_angle / 2;
    state.angle += angleChange;
    state.color = "black";
  }

  state.direction = [Math.cos(state.angle), Math.sin(state.angle)];
}
