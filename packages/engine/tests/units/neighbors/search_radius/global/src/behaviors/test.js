/**
 * Sets `state.num_neighbors` to the number of neighbors found
 */
const behavior = (state, context) => {
  const neighbors = context.neighbors();
  state.num_neighbors = neighbors.length;
};
