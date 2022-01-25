/**
 * Accesses the neighbor's field `value`
 */
const behavior = (state, context) => {
  const neighbor = context.neighbors()[0];
  state.value = neighbor.value;
};
