/**
 * Writes the number of neighbors into `state.num_neighbors`
 */
const behavior = (state, context) => {
  state.num_neighbors = context.neighbors().length;
};
