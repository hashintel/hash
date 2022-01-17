/**
 * @param {AgentState} state of the agent
 * @param {AgentContext} context of the agent
 */
const behavior = (state, context) => {
  one = state.get("one");
  one.b = one.a + 1;
  one.a = 3;
  state.set("one", one);
};
