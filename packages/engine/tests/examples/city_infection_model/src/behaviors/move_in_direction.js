/**
 * @param {AgentState} state of the agent
 * @param {AgentContext} context of the agent
 */
function behavior(state, context) {
  if (state.direction) {
    state.position = state.position.map((x, i) => x + state.direction[i]);
  }
}
