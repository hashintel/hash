/**
 * This behavior filters and parses the San Francisco homes
 * and offices dataset to generate a proportionaly distributed
 * map for the simulation.
 */
function behavior(state, context) {
  const { x_bounds, y_bounds } = context.globals().topology;

  /** This function modifies array a to array b's range. */
  function normalize_range(a, b) {
    a = a.filter((e) => !isNaN(e));
    let min_a = Math.min(...a);
    let min_b = Math.min(...b);
    let max_b = Math.max(...b);
    let max_a = Math.max(...a);

    a = a.map((e) => e - min_a);
    a = a.map((e) => e / (max_a - min_a));
    a = a.map((e) => e * (max_b - min_b) + min_b);
    return a;
  }

  /** This function normalizes a list that includes long_lat coordinates */
  function ll_array(ll, x, y) {
    let latl = ll.map((e) => e.lat);
    let normed_lat = normalize_range(latl, x);
    let longl = ll.map((e) => e.lon);
    let normed_long = normalize_range(longl, y);
    for (let i = 0; i < ll.length; i++) {
      ll[i]["position"] = [normed_lat[i], normed_long[i]];
    }
    return ll;
  }

  /** This function randomly assigns a building type to non-homes. */
  function transform_type(d) {
    if (d == "Commercial Office") {
      return Math.random() < 0.0 ? "groceries" : "offices";
    }
    return "homes";
  }

  // Import a subset of the property data
  const data = context.data()["@b/property_data/sf900homes100offices.csv"];
  let gis_data = JSON.parse(JSON.stringify(data));
  const shuffled = [...gis_data].sort((_) => 0.5 - Math.random());
  let selected = shuffled.slice(0, 0.1 * shuffled.length);

  let json_data = selected.map((row) => ({
    use_def: row[0],
    neighborhood: row[1],
    lat: parseFloat(row[2]),
    lon: parseFloat(row[3]),
    type: transform_type(row[0]),
  }));

  json_data = ll_array(json_data, x_bounds, y_bounds);

  state.agents = state.agents ? state.agents : {};

  state.scatter_templates.forEach((template) => {
    // Sort data into proper agent categories
    const name = template.template_name;
    let scatter_data = json_data.filter((row) => row.type === name);
    if (scatter_data.length == 0) {
      for (const _ of Array(template.template_count).keys()) {
        scatter_data.push({
          position: [
            Math.random() * (x_bounds[1] - x_bounds[0]),
            Math.random() * (y_bounds[1] - y_bounds[0]),
          ],
        });
      }
    }

    // Define the agents
    let agents = [];
    scatter_data.forEach((e) => {
      let agent = {
        ...template,
        position: e.position,
        lng_lat: [e.lat, e.lon],
      };

      delete agent.template_count;
      agents.push(agent);
    });
    state.agents[name] = agents;
  });
}
