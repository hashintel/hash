function on_position(a, neighbors) {
  if (!a.position) {
    throw new Error("agent must have position");
  }
  on_pos = [];
  neighbors.forEach((neighbor) => {
    if (a.position.length === neighbor.position.length) {
      eq_flag = true;
      for (let i = 0; i < a.position.length; i++) {
        if (a.position[i] != neighbor.position[i]) {
          eq_flag = false;
        }
      }
      if (eq_flag) {
        on_pos.push(neighbor);
      }
    }
  })
  return on_pos;
}

function in_radius(a, neighbors, radius = 1) {
  if (!a.position) {
    throw new Error("agent must have position");
  }
  x_bounds = [a.position[0] + radius, a.position[0] - radius];
  y_bounds = [a.position[1] + radius, a.position[1] - radius];

  in_rad = []

  neighbors.forEach((neighbor) => {
    if (
      neighbor.position[0] <= x_bounds[0] &&
      neighbor.position[0] >= x_bounds[1] &&
      neighbor.position[1] <= y_bounds[0] &&
      neighbor.position[1] >= y_bounds[1]
    ) {
      in_rad.push(neighbor);
    }
  })
  return in_rad;
}

module.exports = { on_position, in_radius }
