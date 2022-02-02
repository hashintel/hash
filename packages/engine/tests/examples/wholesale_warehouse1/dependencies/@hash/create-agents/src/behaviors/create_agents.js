/**
 * This behavior generates all the agents that have been defined by other behaviors.
 *
 * agents {<agent type>: [agent definitions]} - stores lists of agent definitions
 */
function behavior(state, context) {
  for (agent_name in state.agents) {
    const agent_list = state.agents[agent_name];

    for (agent of agent_list) {
      state.messages.push({
        to: "hash",
        type: "create_agent",
        data: agent,
      });
    }
  }
}
