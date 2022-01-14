/**
 * @param {AgentState} state of the agent
 * @param {AgentContext} context of the agent
 */
const behavior = (state, context) => {
  state.one.b = state.one.a + 1;
  state.one.a = 3;
};
