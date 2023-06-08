/**
 * This behavior causes an ant agent to deliver
 * food it is carrying and leave pheromones behind it.
 */
function behavior(state, context) {
  // Set angle to face the center
  state.angle = Math.atan2(state.position[1], state.position[0]) - Math.PI;

  // If you reach the center, give away your food and turn around
  if ((Math.abs(state.position[0]) < 1) & (Math.abs(state.position[1]) < 1)) {
    state.angle += Math.PI;
    state.behaviors = [
      "search.js",
      "wrap_angle.js",
      "@hash/move-in-direction/move_in_direction.rs",
      "eat.js",
    ];
    state.color = "black";
  }

  // Find the pheromone you're on
  const localPheromone = context
    .neighbors()
    .filter(
      (n) =>
        n.behaviors.includes("pheromone_field.js") &&
        n.position[0] === Math.round(state.position[0]) &&
        n.position[1] === Math.round(state.position[1]),
    )[0];

  // Strengthen that pheromone
  if (localPheromone) {
    state.addMessage(localPheromone.agent_id, "strengthen", {
      strength: 3,
    });
  }

  // Update direction and angle
  state.direction = [Math.cos(state.angle), Math.sin(state.angle)];
}
