/**
 * @param {AgentState} state of the agent
 * @param {AgentContext} context of the agent
 */
const behavior = (state, context) => {
  if (state.behaviorIndex() !== state.index) {
    state.valid = false;
  }

  state.index += 1;
};
