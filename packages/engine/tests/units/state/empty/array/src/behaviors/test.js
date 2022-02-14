/**
 * Verifies the type of the list
 */
const behavior = (state, context) => {
  state.l1_is_list = typeof state.l1 === "object";
};
