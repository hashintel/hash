/**
 * @param {AgentState} state of the agent
 * @param {AgentContext} context of the agent
 */
const behavior = (state, context) => {
  state.b = state.a.concat(4);
  state.a.unshift(0);
};
