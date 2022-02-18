/**
 * This behavior creates grids of agents based on the defined templates in the creator agent.
 *
 * grid_templates [{
 *   "template_name": name,
 *   ...other properties
 * }] - stores sets of unique properties that will be added to each type of agent.
 */
function behavior(state, context) {
  const { x_bounds, y_bounds } = context.globals()["topology"];

  const width = x_bounds[1] - x_bounds[0];
  const height = y_bounds[1] - y_bounds[0];

  // Make sure to not overwrite existing agents
  state.agents = state.agents ? state.agents : {};

  // Create grids for each defined template
  for (template of state.grid_templates) {
    const name = template["template_name"];
    const count = width * height;

    state.agents[name] = [...Array(count)].map((_, ind) => {
      // Assign each agent a sequential position within the grid
      const x = (ind % width) + x_bounds[0];
      const y = Math.floor(ind / width) + y_bounds[0];
      let agent = {
        // Use the template defined in init.json
        ...template,
        position: [x, y],
      };

      delete agent.template_name;
      return agent;
    });
  }
}
