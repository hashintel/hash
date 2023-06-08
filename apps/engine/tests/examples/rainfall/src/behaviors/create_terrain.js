/**
 * This behavior creates terrain agents based on global variables
 * and the agent_template in init.json
 */
function behavior(state, context) {
  // Get needed global variables
  const { topology, max_cell_height } = context.globals();

  // Calculate width and height from globals
  const width = topology.x_bounds[1] - topology.x_bounds[0];
  const height = topology.y_bounds[1] - topology.y_bounds[0];

  // Create terrain agents
  Array(width * height)
    .fill()
    .map((_val, id) =>
      state.addMessage("HASH", "create_agent", {
        // Use the template defined in init.json and
        // add position and a random height to each agent
        ...state.agent_template,
        position: [id % width, Math.floor(id / width)],
        height: Math.floor(Math.random() * max_cell_height),
      }),
    );
}
