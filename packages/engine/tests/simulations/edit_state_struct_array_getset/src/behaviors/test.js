/**
 * @param {AgentState} state of the agent
 * @param {AgentContext} context of the agent
 */
const behavior = (state, context) => {
  one = state.get("one");
  one[0].b = one[0].a + 1;
  one.push({ c: 3 });
  state.set("one", one);
};
