/**
 * This behavior creates agents with random placements based an the defined templates in the creator agent.
 *
 * scatter_templates [{
 *   "template_name": name,
 *   "template_count": count,
 *   ...other properties
 * }] - stores sets of unique properties that will be added to each type of agent.
 */
function behavior(state, context) {
  const { x_bounds, y_bounds } = context.globals()["topology"];

  const width = x_bounds[1] - x_bounds[0];
  const height = y_bounds[1] - y_bounds[0];

  // Make sure to not overwrite existing agents
  state.agents = state.agents ? state.agents : {};

  // Create scatter for each defined template
  for (template of state.scatter_templates) {
    //scatter_templates.forEach(template => {
    const name = template["template_name"];
    const count = template["template_count"];

    // Store agents in an array in the creator agent
    state.agents[name] = [...Array(count)].map((_) => {
      // Choose random position within topology
      const x = Math.floor(Math.random() * width) + x_bounds[0];
      const y = Math.floor(Math.random() * height) + y_bounds[0];

      let agent = {
        ...template,
        position: [x, y],
      };

      delete agent.template_name;
      delete agent.template_count;
      return agent;
    });
  }
}
