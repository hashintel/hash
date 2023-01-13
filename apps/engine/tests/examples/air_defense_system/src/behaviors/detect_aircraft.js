const behavior = (state, context) => {
  // Update number of available missiles
  const missiles = context
    .messages()
    .filter((m) => m.type === "hit" || m.type === "miss");
  if (missiles.length) {
    state.missilesSent -= missiles.length;
  }

  /**
   * ---- Fire Missiles ----
   * Find aircrafts in range and fire missiles
   */
  const aircrafts = context.neighbors().filter((n) => n.type === "aircraft");
  if (aircrafts.length) {
    const pos = state.position;

    for (let i = 0; i < aircrafts.length; i++) {
      if (state.missilesSent === state.maxMissiles) {
        break;
      }

      const a = aircrafts[i];

      if (!state.targetedAircrafts.includes(a.agent_id) && !a.hit) {
        const dx = pos[0] - a.position[0];
        const dy = pos[1] - a.position[1];
        const dz = pos[2] - a.position[2];

        const dis = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dis < state.search_radius) {
          const missile = {
            position: pos,
            direction: [0, 0, 1],
            velocity: [0, 0, 0],
            speed: state.missileSpeed,
            targetID: a.agent_id,
            radarPos: pos,
            radarID: state.agent_id,
            search_radius: state.search_radius,
            color: "white",
            shape: "missile",
            type: "missile",
            behaviors: ["track_aircraft.js", "move_in_direction.js"],
          };

          state.addMessage("hash", "create_agent", missile);
          state.targetedAircrafts.push(a.agent_id);
          state.missilesSent++;
        }
      }
    }
  }
};
