/**
 * @param {AgentState} state of the agent
 * @param {AgentContext} context of the agent
 */
const behavior = (state, context) => {
  state.set("b", state.get("a") + 2);
  state.set("a", 2);
};
