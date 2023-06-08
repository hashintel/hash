/**
 * This behavior creates the ants with random initial angles.
 */
function behavior(state, context) {
  Array(context.globals().num_ants)
    .fill()
    .map(() => {
      // Choose random initial angle
      const angle = Math.random() * 2 * Math.PI;
      state.addMessage("HASH", "create_agent", {
        position: [0, 0],
        angle,
        // Convert angle to direction
        direction: [Math.cos(angle), Math.sin(angle)],
        height: 1.5,
        behaviors: [
          "search.js",
          "wrap_angle.js",
          "move_in_direction",
          "eat.js",
        ],
        color: "black",
        shape: "ant",
        search_radius: 1,
      });
    });
}
