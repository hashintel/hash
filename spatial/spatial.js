function distance(a, b, distance = "manhattan") {
  /** Returns the specified distance between two agents.
   *  distance is one of the four distance functions supported by HASH,
   *  defaults to manhattan distance.
   */
  dFuncs = {
    manhattan: (a_pos, b_pos) =>
      Math.abs(a_pos[0] - b_pos[0]) + Math.abs(a_pos[1] - b_pos[1]),
    euclidean: (a_pos, b_pos) =>
      Math.sqrt(
        Math.pow(a_pos[0] - b_pos[0], 2) + Math.pow(a_pos[1] - b_pos[1], 2)
      ),
    euclidean_sq: (a_pos, b_pos) =>
      Math.pow(a_pos[0] - b_pos[0], 2) + Math.pow(a_pos[1] - b_pos[1], 2),
    chebyshev: (a_pos, b_pos) =>
      Math.max(Math.abs(a_pos[0] - b_pos[0]), Math.abs(a_pos[1] - b_pos[1])),
  };
  if (!a.position || !b.position) {
    throw new Error("agents must have position");
  }
  return dFuncs[distance](a.position, b.position);
}

function normalize_direction(a) {
    /** Returns the unit vector of the direction of an agent*/
    if (!a.direction) {
        throw new Error("agent must have direction");
    }
    const direction = a.direction
    const magnitude = Math.sqrt(
        direction.reduce((acc, val) => acc + val ** 2, 0));
    return direction.map(v => v / magnitude);
}

function random_position(topology) {
  return [
    Math.floor(
      Math.random() * (topology.x_bounds[1] - topology.x_bounds[0]) +
        topology.x_bounds[0]
    ),
    Math.floor(
      Math.random() * (topology.y_bounds[1] - topology.y_bounds[0]) +
        topology.y_bounds[0]
    ),
  ];
}

module.exports = { distance, random_position, normalize_direction };
