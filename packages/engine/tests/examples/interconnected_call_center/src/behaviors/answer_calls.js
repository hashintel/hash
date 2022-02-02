/**
 * @param {AgentState} state
 * @param {AgentContext} context
 */

//This script handles the calls directed to internal operators
//For each agent, answer calls by decrementing the duration of queued calls
const behavior = (state, context) => {
  //Only handle calls if we are at the right state for answering
  if (state.counter !== 3) {
    return;
  }

  // Answer calls by decrementing remaining call duration
  state.current_calls.forEach((c) => {
    c.duration--;
  });

  //Filter out the calls that have no remaining duration
  const finished_calls = state.current_calls.filter((c) => c.duration === 0);

  //Count the number of local and external calls answered
  const local = finished_calls.filter((c) => c.origin === state.agent_id);
  const external = finished_calls.filter((c) => c.origin !== state.agent_id);

  state.nLocalAnswered += local.length;
  state.nProcessed += local.length;
  state.nExternalAnswered += external.length;

  local.forEach((c) => {
    state.utilization_stats.total_wait_time += c.wait_time;
  });

  external.forEach((c) => {
    state.addMessage(c.origin, "call_success");
    state.addMessage(c.link_return, "call_success");

    state.utilization_stats.total_wait_time += c.wait_time;
  });

  // Remove finished calls
  state.current_calls = state.current_calls.filter((c) => c.duration !== 0);

  // Increment wait_time for queue
  state.call_queue.forEach((c) => {
    c.wait_time++;
  });

  // Visuals
  const color_proportion =
    (state.current_calls.length + state.call_queue.length) /
    (20 + state.operators);
  state.rgb = [255, 255 - 255 * color_proportion, 255 - 255 * color_proportion];

  state.height = state.current_calls.length;
};
