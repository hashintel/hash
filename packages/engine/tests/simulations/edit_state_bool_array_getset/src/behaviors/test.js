/**
 * @param {AgentState} state of the agent
 * @param {AgentContext} context of the agent
 */
const behavior = (state, context) => {
  state.set("b", state.get("a").concat(true));
  a = state.get("a");
  a.unshift(false);
  state.set("a", a);
};
