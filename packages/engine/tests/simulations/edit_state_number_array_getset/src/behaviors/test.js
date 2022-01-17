/**
 * @param {AgentState} state of the agent
 * @param {AgentContext} context of the agent
 */
const behavior = (state, context) => {
  state.set("b", state.get("a").concat(4));
  a = state.get("a");
  a.unshift(0);
  state.set("a", a);
};
