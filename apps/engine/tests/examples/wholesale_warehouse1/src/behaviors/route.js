const behavior = (state, context) => {
  const { routes_map } = context.globals();

  let position = state.get("position");
  let reset_pos = state.get("reset_position");
  let xy_map = state.get("xy_map");
  let routes = state.get("routes");
  let current_route = state.get("current_route");
  let task = state.get("task");

  if (!task && JSON.stringify(position) === JSON.stringify(reset_pos)) {
    return;
  }
  let destination = reset_pos;
  if (task) {
    destination = task.acquired ? task.delivery_position : task.pickup_position;
  }

  function applyMove(pos, m) {
    return [m[0] + pos[0], m[1] + pos[1], 0];
  }

  function compare(a1, a2) {
    if (!a1 || !a2) return;
    return JSON.stringify(a1) === JSON.stringify(a2);
  }

  function checkSeen(loc, seen) {
    if (loc[0] in seen && loc[1] in seen[loc[0]]) {
      return true;
    }
    return false;
  }

  function addSeen(loc, seen) {
    if (loc[0] in seen) {
      seen[loc[0]][loc[1]] = true;
    } else {
      seen[loc[0]] = {};
      seen[loc[0]][loc[1]] = true;
    }
    return seen;
  }

  function search(pos, des, xy_map) {
    if (!pos || !des) {
      return [];
    }
    let queue = [[pos]];
    let seen = new Set();
    seen.add(JSON.stringify(pos));
    while (queue.length) {
      let route = queue.shift();
      let cur_loc = route[route.length - 1];
      if (compare(cur_loc, des)) {
        return route;
      }

      let v_moves = validMoves(cur_loc, xy_map);
      if (v_moves.length) {
        v_moves.forEach((m) => {
          let nl = applyMove(cur_loc, m);
          if (!seen.has(JSON.stringify(nl))) {
            let nr = [...route];
            nr.push(nl);
            queue.push(nr);
            seen.add(JSON.stringify(nl));
          }
        });
      }
    }
    return [];
  }

  function validMoves(position, xy_map) {
    const max_y = xy_map.length;
    const max_x = xy_map[0].length;
    let moves = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
      [0, 0],
    ];
    // console.warn("----")
    const validMoves = moves.filter((m) => {
      let x = m[0] + position[0];
      let y = m[1] + position[1];
      if (xy_map[y][x] == "r") {
        return m;
      }
    });
    return validMoves;
  }

  if (!xy_map?.length) {
    xy_map = context.data()[routes_map];
    state.set("xy_map", xy_map);
  }
  const prev_pos = state.position;

  if (compare(position, destination)) {
    return state;
  } else if (current_route.length) {
    state.set("position", current_route.shift());
    state.set("current_route", current_route);
  } else if (
    String(destination) in routes &&
    String(position) in routes[String(destination)]
  ) {
    current_route = routes[String(destination)][String(position)];
    state.set("position", current_route.shift());
    state.set("current_route", current_route);
  } else if (destination?.length) {
    current_route = search(position, destination, xy_map);
    if (current_route.length > 1) {
      routes[String(destination)] = {};
      routes[String(destination)][String(position)] = current_route;
      state.set("routes", routes);
      state.set("position", current_route.shift());
      state.set("current_route", current_route);
    }
  }

  state.direction = [
    state.position[0] - prev_pos[0],
    state.position[1] - prev_pos[1],
  ];
};
