/**
 * @param {AgentState} state of the agent
 * @param {AgentContext} context of the agent
 */
const behavior = (state, context) => {
  state.one[0].b = state.one[0].a + 1;
  state.one.push({ c: 3 });
};
