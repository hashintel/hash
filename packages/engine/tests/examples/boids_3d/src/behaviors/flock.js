/**
 * This behavior calculates the direction of a boid based
 * to rules of alignment, cohesion and separation.
 */
function behavior(state, context) {
  const neighbors = context.neighbors();
  const { cohesion, inertia, alignment, separation, separation_distance } =
    context.globals();

  // Throw warnings
  if (!state.position || !state.direction) {
    console.warn("Missing needed state", state);
    return;
  }

  // Alignment: steer along the average direction of neighbors
  let align_vec = state.direction;
  if (neighbors.length) {
    // Calculate the average direction
    neighbors.forEach((n) => {
      align_vec = align_vec.map((val, dim) => val + n.direction[dim]);
    });
    align_vec = align_vec.map((item) => item / (neighbors.length + 1)); // normalize
  }
  // Cohesion: steer to move towards the average position (center of mass) of neighbors
  let avg_position = state.position;
  if (neighbors.length) {
    // Calculate the average position
    neighbors.forEach((n) => {
      avg_position = avg_position.map((val, dim) => val + n.position[dim]);
    });
    avg_position = avg_position.map((item) => item / (neighbors.length + 1)); // normalize

    // Calculate the direction from agent to center of mass
  }
  const cohesion_vec = state.position.map((v, dim) => avg_position[dim] - v);

  // Separation: steer to avoid crowding local flockmates
  let sep_vec = [0, 0, 0];
  for (n of hash_stdlib.neighborsInRadius(
    state,
    neighbors,
    separation_distance,
    0,
    true,
  )) {
    state.position.forEach((p, i) => {
      const diff = p - n.position[i];
      sep_vec[i] += diff;
    });
  }

  // Calculate new direction
  state.direction = state.direction.map(
    (existing, dim) =>
      inertia * existing +
      cohesion * cohesion_vec[dim] +
      alignment * align_vec[dim] +
      separation * sep_vec[dim],
  );

  // Normalize the vector:
  const magnitude = Math.sqrt(
    state.direction.reduce((acc, val) => acc + val ** 2, 0),
  );
  state.direction = state.direction.map((v) => v / magnitude);

  // Calculate new position based on the direction
  state.position = state.position.map((pos, dim) => pos + state.direction[dim]);
}
