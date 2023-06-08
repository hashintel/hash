/**
 * This behavior regularly creates raindrop agents which
 * will travel downhill over the terrain until it pools.
 */
function behavior(state, context) {
  // Get global variables
  const { topology, rain_rate, diffusion_length } = context.globals();

  const width = topology.x_bounds[1] - topology.x_bounds[0];
  const height = topology.y_bounds[1] - topology.y_bounds[0];

  // Begin creating raindrop agents after diffusion time ends
  if (state.age >= diffusion_length) {
    for (let index = 0; index < rain_rate; index++) {
      state.addMessage("hash", "create_agent", {
        position: [
          Math.floor(Math.random() * width),
          Math.floor(Math.random() * height),
        ],
        color: "blue",
        shape: "box",
        orient_toward_value: "height",
        still_time: 0,
        still: false,
        orient_toward_value_uphill: false,
        orient_toward_value_cumulative: true,
        // The combination of orient_toward_value and move_in_direction
        // causes this agent to move "downhill"
        behaviors: [
          "raindrop.js",
          "@hash/orient-toward-value/orient_toward_value.rs",
          "@hash/move-in-direction/move_in_direction.rs",
        ],
      });
    }
  }
}
