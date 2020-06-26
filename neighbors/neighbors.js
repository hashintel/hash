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

function front(a, neighbors, colinear = false) {
  /** Searches and returns all neighbors whose positions are in front of an agent.
  *   Default is set to planer calculations and will return all neighbors located
  *   in front of the plane created by the agent's direction
  *
  *   Linear - If set to true, will return all neighbors on the same line as agent a.
  */
  if (!a.direction) {
    throw new Error("agent must have direction");
  }
  n_front = neighbors.filter((neighbor) => {
    if (colinear){
      const count = a.direction.reduce(function(n, val) {
        return n + (val === 1);
      }, 0);

      dx = neighbor.position[0] - a.position[0];
      dy = neighbor.position[1] - a.position[1];
      dz = neighbor.position[2] - a.position[2];

      xt = a.direction[0] !== 0 ? (dx) / a.direction[0] : 0;
      yt = a.direction[1] !== 0 ? (dy) / a.direction[1] : 0;
      zt = a.direction[2] !== 0 ? (dz) / a.direction[2] : 0;

      // Only one direction set - only that axis value can change
      if (count === 1) {
        return (xt > 0 && dy === 0 && dz ===0) || (yt > 0 && dx === 0 && dz === 0) || (zt > 0 && dx === 0 && dy === 0);
      }
      // Two directions set
      else if (count === 2) {
        return xt === yt &&  xt > 0 && dz === 0 || yt === zt && yt > 0 && dx === 0 || xt === zt && xt > 0 && dy ===0;
      }
      // Three directions set
      else if (count === 3){
        return (xt === yt && yt === zt) && xt > 0;
      }
      // Else direction is [0,0,0] or an unsupported direction array
      else {
        return false;
      }

      return true;
    } else

    // Planer calculations
    dx = neighbor.position[0] - a.position[0];
    dy = neighbor.position[1] - a.position[1];
    dz = neighbor.position[2] - a.position[2];

    const D = a.direction[0]*(dx) + a.direction[1]*(dy) + a.direction[2]*(dz);

    if (D <= 0) { return false; }

    return true;
  });

  return n_front;
}

function behind(a, neighbors, colinear = false) {
  /** Searches and returns all neighbors whose positions are behind an agent.
  *   Default is set to planer calculations and will return all neighbors located
  *   behind the plane created by the agent's direction
  *
  *   Colinear - If set to true, will return all neighbors on the same line as agent a.
  */
  if (!a.direction) {
    throw new Error("agent must have direction");
  }
  n_behind = neighbors.filter((neighbor) => {
    if (colinear){
      const count = a.direction.reduce(function(n, val) {
        return n + (val === 1);
      }, 0);

      xt = a.direction[0] !== 0 ? (neighbor.position[0] - a.position[0]) / a.direction[0] : 0;
      yt = a.direction[1] !== 0 ? (neighbor.position[1] - a.position[1]) / a.direction[1] : 0;
      zt = a.direction[2] !== 0 ? (neighbor.position[2] - a.position[2]) / a.direction[2] : 0;

      // Only one direction set - only that axis value can change
      if (count === 1) {
        dx = neighbor.position[0] - a.position[0];
        dy = neighbor.position[1] - a.position[1];
        dz = neighbor.position[2] - a.position[2];
        return (xt < 0 && dy === 0 && dz ===0) || (yt < 0 && dx === 0 && dz === 0) || (zt < 0 && dx === 0 && dy === 0);
      }
      // Two directions set
      else if (count === 2) {
        return xt === yt &&  xt < 0 && dz === 0 || yt === zt && yt < 0 && dx === 0 || xt === zt && xt < 0 && dy ===0;
      }
      // Three directions set
      else if (count === 3){
        return (xt === yt && yt === zt) && xt < 0;
      }
      // Else direction is [0,0,0] or an unsupported direction array
      else {
        return false;
      }

      return true;
    } else

    // Planer calculations
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
