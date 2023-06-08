/**
 * @param {AgentState} state
 * @param {AgentContext} context
 */
const behavior = (state, context) => {
  const {
    topology,
    asset_topology,
    nAssets,
    radarLocations,
    missileSpeed,
    radarMaxMissiles,
    radarZone,
  } = context.globals();

  function random_pos(bounds) {
    return Math.floor(
      Math.random() * (asset_topology[bounds][1] - asset_topology[bounds][0]) +
        asset_topology[bounds][0],
    );
  }

  // Create Assets
  state.agents["assets"] = [];
  let asset_pos = [];
  for (let i = 0; i < nAssets; i++) {
    let x = random_pos("x_bounds");
    let y = random_pos("y_bounds");

    while (asset_pos.includes(JSON.stringify([x, y, 0]))) {
      x = random_pos("x_bounds");
      y = random_pos("y_bounds");
    }

    const asset = {
      ...state.assets_template,
      position: [x, y, 0],
    };

    asset_pos.push(JSON.stringify([x, y, 0]));

    state.agents["assets"].push(asset);
  }

  // Create Radars
  state.agents["radars"] = [];
  radarLocations.forEach((rl) => {
    const radar = {
      ...state.radar_template,
      position: rl,
      missileSpeed,
      maxMissiles: radarMaxMissiles,
      search_radius: radarZone,
    };

    state.agents["radars"].push(radar);
  });

  // Update Aircraft Generator
  const width = topology.x_bounds[1] - topology.x_bounds[0];
  const height = topology.y_bounds[1] - topology.y_bounds[0];

  const pos_x = Math.floor(width / 2);
  const pos_y = Math.floor(height / 2);
  const search_radius = width >= height ? width + 2.5 : height + 2.5;

  state.agents["aircraft_generator"][0].position = [pos_x, pos_y, -1.5];
  state.agents["aircraft_generator"][0].search_radius = search_radius;
};
