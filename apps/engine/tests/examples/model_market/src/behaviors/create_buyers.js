/**
 * This behavior creates agent definitions for the buyers.
 */
function behavior(state, context) {
  const { buyer_count, topology, window_shopping_steps } = context.globals();

  const width = topology.x_bounds[1] - topology.x_bounds[0];
  const height = topology.y_bounds[1] - topology.y_bounds[0];

  // Create agent definitions for generating later
  state.agents["buyers"] = Array(buyer_count)
    .fill()
    .map((_val, id) => ({
      position: [
        Math.floor(Math.random() * width),
        Math.floor(Math.random() * height),
      ],
      color: "violet",
      purchased: false,
      can_buy: false,
      window_shopping_counter:
        Math.floor(Math.random() * window_shopping_steps) + 1,
      lowest_price: 0,
      height: 4,
      behaviors: ["buyer.js", "@hash/random-movement/random_movement.rs"],
    }));
}
