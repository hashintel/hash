/**
 * @param {AgentState} state of the agent
 * @param {AgentContext} context of the agent
 */
const behavior = (state, context) => {
  if (state.age) {
    state.age += 1;
  } else {
    state.age = 1;
  }
};
