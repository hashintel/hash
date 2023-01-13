const behavior = (state, context) => {
  const avoid_type = state.get("avoid_type");
  const state_position = state.get("position");
  let new_position = state.get("position");

  /**
   * --- Conveyor Belt Movement ---
   */
  const conveyor_belt = context
    .neighbors()
    .filter(
      (n) =>
        JSON.stringify(state_position) === JSON.stringify(n.position) &&
        (n.behaviors.includes("conveyor_belt.js") ||
          n.behaviors.includes("@hash/conveyor-belt/conveyor_belt.js")),
    );
  if (conveyor_belt.length) {
    const cb = conveyor_belt[0];
    const dir = cb.c_dir;

    new_position = [
      state_position[0] + dir[0],
      state_position[1] + dir[1],
      state_position[2] + dir[2],
    ];

    // Agent will not move if another agent is in front of it
    const in_front = context
      .neighbors()
      .filter(
        (n) =>
          JSON.stringify(new_position) === JSON.stringify(n.position) &&
          (n.behaviors.includes(avoid_type) || !avoid_type),
      );
    if (in_front.length) {
      new_position = state_position;
    }
  }

  state.set("position", new_position);
};
