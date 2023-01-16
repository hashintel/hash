/**
 * This behavior creates sugar agents with heterogenous
 * metabolism and vision values.
 */
function behavior(state, context) {
  // Import global variables
  const {
    topology,
    initial_sugar,
    agent_vision,
    agent_metabolism,
    agent_density,
  } = context.globals();

  const width = topology.x_bounds[1] - topology.x_bounds[0];
  const height = topology.y_bounds[1] - topology.y_bounds[0];

  /**
   * This function generates a uniform distribution based
   * on a max and min value defined in globals.json.
   */
  function randomUniform(data) {
    const scale = data.scale || 1;
    const range = (data.max - data.min + 1) / scale;

    return Math.floor(Math.random() * range + data.min / scale) * scale;
  }

  // Create the agents
  Array(Math.floor(width * height * agent_density))
    .fill()
    .map(() => {
      state.addMessage("HASH", "create_agent", {
        ...state.agent_template, // begin with template in init.json
        position: [
          Math.floor(Math.random() * width),
          Math.floor(Math.random() * height),
        ],
        sugar: randomUniform(initial_sugar),
        metabolism: randomUniform(agent_metabolism),
        search_radius: randomUniform(agent_vision),
      });
    });
}
