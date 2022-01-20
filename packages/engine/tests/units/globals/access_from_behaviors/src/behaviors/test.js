/**
 * Access globals from behavior
 */
const behavior = (state, context) => {
  state.a = context.globals().a;
};
