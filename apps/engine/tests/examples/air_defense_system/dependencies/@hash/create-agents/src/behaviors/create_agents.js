/**
 * This behavior generates all the agents that have been defined by other behaviors.
 *
 * agents {<agent type>: [agent definitions]} - stores lists of agent definitions
 */
function behavior(state, context) {
  let messages = state.get("messages");
  const agents = state.get("agents");

  for (agent_name in agents) {
    const agent_list = agents[agent_name];

    for (agent of agent_list) {
      messages.push({
        to: "hash",
        type: "create_agent",
        data: agent,
      });
    }
  }

  state.set("messages", messages);
}
