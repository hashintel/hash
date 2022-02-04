/**
 * @param {AgentState} state
 * @param {AgentContext} context
 */

//For each agent, use the system of messages to handle incoming external calls
const behavior = (state, context) => {
  const ms = context.messages();
  // External success (update links)
  const success = ms.filter((m) => m.type === "call_success");
  state.nProcessed += success.length;

  // External failure (update links)
  const failure = ms.filter((m) => m.type === "balked_call");
  state.nBalked += failure.length;

  // Handle external call transfers
  const external_calls = ms
    .filter((m) => m.type === "external_call")
    .map((m) => m.data);

  external_calls.forEach((c) => state.call_queue.push(c));
};
