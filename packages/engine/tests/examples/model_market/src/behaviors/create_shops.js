/**
 * This behavior creates agent definitions for the shops.
 */
function behavior(state, context) {
  const { topology, max_price, min_price, max_cost, min_cost } =
    context.globals();

  const width = topology.x_bounds[1] - topology.x_bounds[0];
  const height = topology.y_bounds[1] - topology.y_bounds[0];

  /** This function generates a shop agent */
  const create_shops = (id, color, price, cost) => ({
    position: [id % width, Math.floor(id / width)],
    color,
    cost,
    price,
    height: 2,
    behaviors: ["shop.js"],
  });

  // Store a set of shop agents for generating later
  state.agents["shops"] = Array(width * height)
    .fill()
    .map((_val, id) => {
      const cost = Math.floor(Math.random() * max_cost) + min_cost;
      const price = Math.floor(Math.random() * max_price) + min_price;
      const color = cost > price ? "white" : "skyblue";
      return create_shops(id, color, price, cost);
    });
}
