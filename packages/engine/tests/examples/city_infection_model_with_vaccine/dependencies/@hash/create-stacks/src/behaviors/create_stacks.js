/**
 * This behavior creates multiple agents in the same location
 * based on the defined templates in the creator agent.
 *
 * stack_templates [{
 *   "template_name": name,
 *   "template_count": count,
 *   "template_position": position,
 *   ...other properties
 * }] - stores sets of unique properties that will be added to each type of agent.
 */
function behavior(state, context) {
  // Make sure to not overwrite existing agents
  state.agents = state.agents ? state.agents : {};

  // Create pile for each defined template
  for (template of state.stack_templates) {
    let position;
    const name = template["template_name"];
    const count = template["template_count"];
    const template_position = template["template_position"];

    if (template_position === "center") {
      // Calculate the center of the topology
      const { x_bounds, y_bounds } = context.globals().topology;
      const width = x_bounds[1] - x_bounds[0];
      const height = y_bounds[1] - y_bounds[0];

      position = [
        Math.floor(width / 2) + x_bounds[0],
        Math.floor(height / 2) + y_bounds[0],
      ];
    } else {
      position = template_position;
    }

    // Store an array of the agents
    state.agents[name] = [...Array(count)].map((_) => {
      let agent = {
        ...template,
        position,
      };

      delete agent.template_name;
      delete agent.template_count;
      delete agent.template_position;
      return agent;
    });
  }
}
