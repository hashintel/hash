/**
 * Ensure that context can't be altered from behaviors
 */
const behavior = (state, context) => {
  context.globals().a = 5;
  state.a = context.globals().a;
};
