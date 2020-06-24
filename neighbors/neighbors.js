function on_position(a, neighbors) {
  /** Returns all neighbors that share an agent's position */
  if (!a.position) {
    throw new Error("agent must have position");
  }
  on_pos = neighbors.filter((neighbor) => {
    for (let ind = 0; ind < a.position.length; ind++) {
      if (a.position[ind] !== neighbor.position[ind]) {
        return false;
      }
    }
    return true;
  });

  return on_pos;
}

function in_radius(a, neighbors, max_radius = 1, min_radius = 0, z_axis = false) {
  /** Returns all neighbors within a certain vision radius of an agent.
  *   Defaults vision max_radius to 1, min_radius to 0
  *   Default is 2D (z_axis set to false), set z_axis to true for 3D positions
  */
  if (!a.position) {
    throw new Error("agent must have position");
  }

  in_rad = neighbors.filter((neighbor) => {
    for (let ind = 0; ind < a.position.length - 1 * !z_axis; ind++){
      max = [a.position[ind] + max_radius, a.position[ind] - max_radius];
      min = [a.position[ind] + min_radius, a.position[ind] - min_radius];
      if (
        !((neighbor.position[ind] <= max[0] &&
          neighbor.position[ind] >= min[0]) ||
          (neighbor.position[ind] >= max[1] &&
          neighbor.position[ind] <= min[1]))
      ){
        return false;
      }
    }

    return true;
  });

  return in_rad;
}

function front(a, neighbors) {
  /** Searches and returns all neighbors whose positions are in front of an agent. */
  if (!a.direction) {
    throw new Error("agent must have direction");
  }
  n_front = neighbors.filter((neighbor) => {
    dx = neighbor.position[0] - a.position[0];
    dy = neighbor.position[1] - a.position[1];
    dz = neighbor.position[2] - a.position[2];

    const D = a.direction[0]*(dx) + a.direction[1]*(dy) + a.direction[2]*(dz);

    if (D <= 0) { return false; }

    return true;
  });

  return n_front;
}

function behind(a, neighbors) {
  /** Searches and returns all neighbors whose positions are behind the agent. */
  if (!a.direction) {
    throw new Error("agent must have direction");
  }
  n_behind = neighbors.filter((neighbor) => {
    dx = neighbor.position[0] - a.position[0];
    dy = neighbor.position[1] - a.position[1];
    dz = neighbor.position[2] - a.position[2];

    const D = a.direction[0]*(dx) + a.direction[1]*(dy) + a.direction[2]*(dz);

    if (D >= 0) { return false; }

    return true;
  });

  return n_behind;
}

module.exports = { on_position, in_radius, front, behind }
