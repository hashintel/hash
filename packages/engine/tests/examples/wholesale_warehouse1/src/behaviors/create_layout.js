const behavior = (state, context) => {
  let agents = state.agents ? state.agents : {};

  state.layout_files.forEach((file) => {
    const layout = context.data()[file];
    const offset =
      state.layout_offsets && file in state.layout_offsets
        ? state.layout_offsets[file]
        : [0, 0, 0];
    const height = layout.length;

    layout.forEach((row, pos_y) => {
      row.forEach((col, pos_x) => {
        // If col value is in layout keys, create agent
        if (state.layout_keys[col]) {
          const type = state.layout_keys[col];
          agents[type] = agents[type] ? agents[type] : [];

          const agent_name = state.layout_templates[type].agent_name
            ? state.layout_templates[type].agent_name
            : type + agents[type].length;

          agents[type].push({
            ...state.layout_templates[type],
            agent_name,
            position: [
              pos_x + offset[0],
              height - pos_y + offset[1],
              0 + offset[2],
            ],
          });
        }
      });
    });
  });

  state.agents = agents;
};
