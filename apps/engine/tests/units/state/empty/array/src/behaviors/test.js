/**
 * Verifies the type of the list
 */
const behavior = (state, context) => {
  state.l1_is_list = Array.isArray(state.l1);
  state.l1_is_empty = state.l1.length === 0;
};
