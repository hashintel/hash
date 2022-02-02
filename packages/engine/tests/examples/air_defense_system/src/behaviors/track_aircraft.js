const behavior = (state, context) => {
  const aircraft = context
    .neighbors()
    .filter((n) => n.agent_id === state.targetID);
  if (aircraft.length) {
    const a = aircraft[0];
    const pos = state.position;
    const v = state.speed;
    const rPos = state.radarPos;

    const dx = a.position[0] - pos[0];
    const dy = a.position[1] - pos[1];
    const dz = a.position[2] - pos[2];

    const tdis = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const radarDis = Math.sqrt(
      Math.sqrt(pos[0] - rPos[0]) +
        Math.sqrt(pos[1] - rPos[1]) +
        Math.sqrt(pos[2] - rPos[2]),
    );

    const A = dy * dy + dz * dz;
    const B = dx * (a.velocity[1] * dy + a.velocity[2] * dz);
    const C = dx * dx;

    const F =
      C *
      (a.velocity[1] * a.velocity[1] + a.velocity[2] * a.velocity[2] - v * v);

    const P = (B - A * a.velocity[0]) / (A + C);
    const Q = (F + a.velocity[0] * (A * a.velocity[0] - 2 * B)) / (A + C);

    const D = P * P - Q;

    const vx = -P + Math.sqrt(Math.abs(D)) * Math.sign(dx);
    const vy = a.velocity[1] + ((vx - a.velocity[0]) * dy) / dx;

    const tm = dx / (vx - a.velocity[0]);

    const vz =
      Math.sqrt(Math.abs(v * v - vx * vx - vy * vy)) *
      Math.sign(dz + a.velocity[2] * tm);

    const xm = pos[0] + vx * tm;
    const ym = pos[1] + vy * tm;
    const zm = pos[2] + vz * tm;

    if (tdis < 1) {
      console.log("---- Hit ----");
      state.color = "orange";
      state.shape = "sphere";
      state.scale = [2, 2, 2];
      state.behaviors = [];

      state.addMessage("hash", "remove_agent");
      state.addMessage(state.radarID, "hit");
      state.addMessage(state.targetID, "hit");
    } else if (
      radarDis > state.search_radius ||
      D < 0 ||
      Math.pow(xm - rPos[0], 2) +
        Math.pow(ym - rPos[1], 2) +
        Math.pow(zm - rPos[2], 2) >
        state.search_radius * state.search_radius
    ) {
      console.log("**** Miss ****");
      state.addMessage("hash", "remove_agent");
      state.addMessage(state.radarID, "miss");
    }

    if (vx && vy && vz) {
      state.velocity = [vx, vy, vz];
      state.direction = [vx, vy, vz];
    }
  } else {
    state.addMessage("hash", "remove_agent");
  }
};
