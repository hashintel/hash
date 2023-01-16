/**
 * @param {AgentState} state of the agent
 * @param {AgentContext} context of the agent
 */
const behavior = (state, context) => {
  const ns = context
    .neighbors()
    .filter((n) => n.nBalked > 0)
    .map((n) => n.nBalked);
  const balked_calls_factor = hstd.stats.sum(ns);

  const call_center_factor =
    context.globals().n_call_centers *
    context.globals().call_center_cost_factor;

  const metric = call_center_factor + balked_calls_factor;

  state.metric = metric;
};
