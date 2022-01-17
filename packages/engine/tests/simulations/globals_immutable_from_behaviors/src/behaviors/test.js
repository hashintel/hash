/**
 * @param {AgentState} state of the agent
 * @param {AgentContext} context of the agent
 */
const behavior = (state, context) => {
  if (state.first) {
    context.globals().a = 5;
    state.a = context.globals().a;
    state.first = false;
  } else {
    state.b = context.globals().a;
  }
};
