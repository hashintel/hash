export const creatorAgentSource = (agent: { [key: string]: any }) =>
  `/**
 * This agent was created by the process chart plugin.
 * 
 * It will be overwritten if the plugin is used again.
 */

function behavior(state, context) {
  const agent = ${JSON.stringify(agent, null, 2)};
  state.addMessage("hash", "create_agent", agent);
  state.addMessage("hash", "remove_agent");
}`;
