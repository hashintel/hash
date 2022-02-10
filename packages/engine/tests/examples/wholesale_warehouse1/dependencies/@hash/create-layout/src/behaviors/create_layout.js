const behavior = (state, context) => {
  let agents = state.get("agents") ? state.get("agents") : {};

  const layout_files = state.get("layout_files");
  const layout_keys = state.get("layout_keys");
  const layout_templates = state.get("layout_templates");
  const layout_offsets = state.get("layout_offsets")
    ? state.get("layout_offsets")
    : {};

  layout_files.forEach((file) => {
    const layout = context.data()[file];
    const offset = layout_offsets[file] ? layout_offsets[file] : [0, 0, 0];

    layout.forEach((row, pos_y) => {
      row.forEach((col, pos_x) => {
        // If col value is in layout keys, create agent
        if (layout_keys[col]) {
          const type = layout_keys[col];
          agents[type] = agents[type] ? agents[type] : [];

          const agent_name = layout_templates[type].agent_name
            ? layout_templates[type].agent_name
            : type + agents[type].length;

          agents[type].push({
            ...layout_templates[type],
            agent_name,
            position: [pos_x + offset[0], pos_y + offset[1], 0 + offset[2]],
          });
        }
      });
    });
  });

  state.set("agents", agents);
};
