const behavior = (state, context) => {
  const { g } = context.globals();

  if (state.hit) {
    return;
  }

  const tpos = state.target_pos;
  const pos = state.position;

  const dis = Math.sqrt(
    Math.pow(tpos[0] - pos[0], 2) + Math.pow(tpos[1] - pos[1], 2),
  );

  /**
   * ---- Drop Bomb ---
   * Drop bomb if within bombing distance
   */
  if (dis <= state.bombing_dis && !state.bomb_dropped) {
    const dir = [state.direction[0], state.direction[1], -g];
    const bomb = {
      direction: dir,
      velocity: dir,
      color: "violet",
      position: pos,
      shape: "missile",
      scale: [0.5, 0.5, 0.5],
      type: "bomb",
      behaviors: ["move_in_direction.js", "explode.js"],
    };

    state.addMessage("hash", "create_agent", bomb);

    state.bomb_dropped = true;
  }
};
