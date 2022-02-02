const behavior = (state, context) => {
  const { aircraftIntensity, aircraftSpeed, aircraftZ, topology, g } =
    context.globals();

  // Generate aircrafts
  const assets_remaining = context
    .neighbors()
    .filter((n) => n.type === "asset" && n.alive);
  if (Math.random() < aircraftIntensity && assets_remaining.length) {
    const pos_y = Math.floor(
      Math.random() * (topology.y_bounds[1] - topology.y_bounds[0]) +
        topology.y_bounds[0],
    );

    const r_index = Math.floor(Math.random() * assets_remaining.length);
    const target_pos = assets_remaining[r_index].position;

    let vx = target_pos[0];
    let vy = target_pos[1] - pos_y;
    const v1 = Math.sqrt(vx * vx + vy * vy);
    vx *= aircraftSpeed / v1;
    vy *= aircraftSpeed / v1;

    if (vx < 0) {
      vx *= -1;
      vy *= -1;
    }

    const bombing_dis = Math.sqrt(((vx * vx + vy * vy) * 9.0 * aircraftZ) / g);

    state.addMessage("hash", "create_agent", {
      ...state.aircraft_template,
      position: [0, pos_y, aircraftZ],
      velocity: [vx, vy, 0],
      direction: [vx, vy, 0],
      target_pos,
      bombing_dis,
    });
  }
};
